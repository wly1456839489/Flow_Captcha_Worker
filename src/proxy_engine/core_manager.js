const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const crypto = require('crypto');
const yaml = require('js-yaml');

const BIN_DIR = path.join(__dirname, '..', '..', 'bin');
const MIHOMO_VERSION = 'v1.18.9';

let downloadState = {
  isDownloading: false,
  totalBytes: 0,
  downloadedBytes: 0,
  stage: 'idle'
};

let geoDownloadState = {
  isDownloading: false,
  totalBytes: 0,
  downloadedBytes: 0,
  stage: 'idle'
};

function getDownloadState() { return downloadState; }
function getGeoDownloadState() { return geoDownloadState; }

function getMihomoBinaryPath() {
  const platform = os.platform();
  const ext = platform === 'win32' ? '.exe' : '';
  return path.join(BIN_DIR, `mihomo${ext}`);
}

function getDownloadUrl() {
  const platform = os.platform();
  const arch = os.arch();
  
  let osStr = 'linux';
  if (platform === 'win32') osStr = 'windows';
  if (platform === 'darwin') osStr = 'darwin';
  
  let archStr = 'amd64';
  if (arch === 'arm64') archStr = 'arm64';
  
  let ext = 'gz';
  if (osStr === 'windows') ext = 'zip';

  // Mihomo naming convention
  const filename = `mihomo-${osStr}-${archStr}-${MIHOMO_VERSION}.${ext}`;
  return `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/${filename}`;
}

async function ensureCore() {
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
  const binPath = getMihomoBinaryPath();
  
  if (fs.existsSync(binPath)) {
    return binPath;
  }
  
  console.log(`\x1b[36m[CoreManager]\x1b[0m ⏳ Downloading mihomo core for ${os.platform()} ${os.arch()}...`);
  const url = getDownloadUrl();
  console.log(`\x1b[36m[CoreManager]\x1b[0m URL: ${url}`);
  
  const isZip = url.includes('.zip');
  const tempFile = path.join(BIN_DIR, `core_temp_dl${isZip ? '.zip' : '.gz'}`);
  
  downloadState.isDownloading = true;
  downloadState.stage = 'downloading';
  downloadState.totalBytes = 0;
  downloadState.downloadedBytes = 0;

  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, handleResponse).on('error', reject);
        return;
      }
      handleResponse(res);
      
      function handleResponse(finalRes) {
        if (finalRes.statusCode >= 400) return reject(new Error(`Download failed with status ${finalRes.statusCode}`));
        
        if (finalRes.headers['content-length']) {
          downloadState.totalBytes = parseInt(finalRes.headers['content-length'], 10);
        }

        const fileStream = fs.createWriteStream(tempFile);
        finalRes.on('data', (chunk) => {
          downloadState.downloadedBytes += chunk.length;
        });

        finalRes.pipe(fileStream);
        fileStream.on('finish', () => { fileStream.close(); resolve(); });
        fileStream.on('error', reject);
      }
    }).on('error', reject);
  });

  downloadState.stage = 'extracting';
  console.log(`\x1b[36m[CoreManager]\x1b[0m 📦 Extracting...`);
  try {
    if (os.platform() === 'win32') {
      const execSync = require('child_process').execSync;
      execSync(`powershell -Command "Expand-Archive -Path '${tempFile}' -DestinationPath '${BIN_DIR}' -Force"`);
      // Find the extracted exe
      const files = fs.readdirSync(BIN_DIR);
      const exeName = files.find(f => f.startsWith('mihomo-') && f.endsWith('.exe'));
      if (exeName) {
        fs.renameSync(path.join(BIN_DIR, exeName), binPath);
      } else {
         throw new Error("No exe found in extracted zip");
      }
    } else {
      const execSync = require('child_process').execSync;
      execSync(`gzip -d -c '${tempFile}' > '${binPath}'`);
      fs.chmodSync(binPath, 0o755);
    }
  } catch (err) {
    downloadState.stage = 'error';
    throw new Error(`Extraction failed: ${err.message}. Please manually download from ${url} and place as ${binPath}`);
  } finally {
    if (downloadState.stage !== 'error') {
       downloadState.stage = 'done';
       setTimeout(() => { downloadState.isDownloading = false; }, 2000);
    }
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
  
  console.log(`\x1b[36m[CoreManager]\x1b[0m ✅ Core ready at ${binPath}`);
  return binPath;
}

let activeCores = new Map();

/**
 * Spawns a dedicated mihomo instance for a given single Proxy Node configuration.
 * Returns the local HTTP port.
 */
async function spawnProxyCore(workerId, proxyNodeConfig) {
  const binPath = await ensureCore();
  
  // Find a free port
  // A simple hack to spread ports out
  const basePort = Math.floor(Math.random() * 20000) + 20000;
  const mixedPort = basePort;
  const controllerPort = basePort + 1;
  const configDir = path.join(BIN_DIR, `workdir_${workerId}`);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  
  const yamlConfig = {
    "mixed-port": mixedPort,
    "allow-lan": true,
    "mode": "Global",
    "log-level": "warning",
    "ipv6": false,
    "external-controller": `127.0.0.1:${controllerPort}`,
    "proxies": [
      proxyNodeConfig
    ],
    "proxy-groups": [
      {
        "name": "GLOBAL",
        "type": "select",
        "proxies": [proxyNodeConfig.name]
      }
    ]
  };

  const configPath = path.join(configDir, `config.yaml`);
  fs.writeFileSync(configPath, yaml.dump(yamlConfig));

  // Spawn process
  console.log(`\x1b[36m[CoreManager]\x1b[0m 🚀 Spawning proxy core for Worker ${workerId} on port ${mixedPort} using node '${proxyNodeConfig.name}'`);
  
  const child = spawn(binPath, ['-d', configDir, '-f', configPath], {
    detached: false,
    stdio: 'ignore' 
  });

  child.on('error', (err) => {
    console.error(`\x1b[36m[CoreManager]\x1b[0m ❌ Failed to start core processing for worker ${workerId}:`, err);
  });

  child.on('exit', (code) => {
    console.log(`\x1b[36m[CoreManager]\x1b[0m 💀 Proxy core for Worker ${workerId} exited with code ${code}`);
    activeCores.delete(workerId);
  });

  activeCores.set(workerId, {
    child,
    localHttpHost: `127.0.0.1:${mixedPort}`,
    configDir,
    configPath
  });

  // Give it a brief moment to start up and bind ports
  await new Promise(r => setTimeout(r, 1000));
  
  return `127.0.0.1:${mixedPort}`;
}

async function killProxyCore(workerId) {
  const core = activeCores.get(workerId);
  if (core) {
    if (core.child) {
      core.child.kill('SIGTERM');
    }
    // Cleanup generated config
    try {
      if (fs.existsSync(core.configPath)) fs.unlinkSync(core.configPath);
      if (fs.existsSync(core.configDir)) fs.rmdirSync(core.configDir);
    } catch(e) {}
    activeCores.delete(workerId);
    console.log(`\x1b[36m[CoreManager]\x1b[0m 🧹 Destroyed proxy core for Worker ${workerId}`);
  }
}

function checkCoreStatus() {
  const binPath = getMihomoBinaryPath();
  return {
    installed: fs.existsSync(binPath),
    platform: os.platform(),
    arch: os.arch(),
    version: MIHOMO_VERSION,
    path: binPath
  };
}

function checkGeoDbStatus() {
  const mmdbPath = path.join(BIN_DIR, 'Country.mmdb');
  let installed = false;
  let mbSize = 0;
  if (fs.existsSync(mmdbPath)) {
    installed = true;
    mbSize = (fs.statSync(mmdbPath).size / 1024 / 1024).toFixed(2);
  }
  return {
    installed,
    path: mmdbPath,
    size: mbSize,
    databaseType: 'MaxMind GeoIP2 Country'
  };
}

async function downloadGeoDb() {
  const mmdbPath = path.join(BIN_DIR, 'Country.mmdb');
  const GEO_URL = 'https://github.com/Dreamacro/maxmind-geoip/releases/latest/download/Country.mmdb';
  
  geoDownloadState = { isDownloading: true, totalBytes: 0, downloadedBytes: 0, stage: 'downloading' };

  await new Promise((resolve, reject) => {
    https.get(GEO_URL, function handleResponse(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return https.get(res.headers.location, handleResponse).on('error', reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      if (res.headers['content-length']) geoDownloadState.totalBytes = parseInt(res.headers['content-length'], 10);
      
      const fileStream = fs.createWriteStream(mmdbPath);
      res.on('data', chunk => geoDownloadState.downloadedBytes += chunk.length);
      res.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', reject);
    }).on('error', reject);
  }).catch(e => {
    geoDownloadState.stage = 'error';
    throw e;
  }).finally(() => {
    if (geoDownloadState.stage !== 'error') geoDownloadState.stage = 'done';
    setTimeout(() => { geoDownloadState.isDownloading = false; }, 2000);
  });
}

function getDownloadState() { return downloadState; }

module.exports = {
  checkCoreStatus,
  checkGeoDbStatus,
  downloadGeoDb,
  getDownloadState,
  getGeoDownloadState,
  ensureCore,
  spawnProxyCore,
  killProxyCore
};
