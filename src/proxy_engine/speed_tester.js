const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const http = require('http');
const { ensureCore } = require('./core_manager');

const BIN_DIR = path.join(__dirname, '..', '..', 'bin');

async function testLatency(nodes) {
  if (!nodes || nodes.length === 0) return [];

  const binPath = await ensureCore();
  
  const basePort = Math.floor(Math.random() * 10000) + 30000;
  const controllerPort = basePort;
  
  const proxyConfigMap = new Map();
  const proxyList = nodes.map((n, idx) => {
    let cfg = Object.assign({}, n.config);
    // ensure names are strictly unique to avoid Mihomo fatal duplicates error
    cfg.name = `test_${idx}_${Date.now()}`;
    proxyConfigMap.set(n.id, cfg.name);
    return cfg;
  });

  const yamlConfig = {
    "allow-lan": false,
    "mode": "Global",
    "log-level": "error",
    "external-controller": `127.0.0.1:${controllerPort}`,
    "proxies": proxyList,
    "proxy-groups": [
      {
        "name": "GLOBAL",
        "type": "select",
        "proxies": proxyList.map(p => p.name)
      }
    ]
  };

  const configPath = path.join(BIN_DIR, `speedtest_${Date.now()}.yaml`);
  fs.writeFileSync(configPath, yaml.dump(yamlConfig));

  console.log(`[SpeedTester] Spawning test core on port ${controllerPort} for ${nodes.length} nodes...`);
  
  const child = spawn(binPath, ['-d', BIN_DIR, '-f', configPath], {
    detached: false,
    stdio: 'inherit'
  });

  // Wait up to 15 seconds for core to fully boot
  let coreReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${controllerPort}/`, (res) => {
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(500, () => { req.destroy(); reject(new Error('timeout')); });
      });
      coreReady = true;
      break;
    } catch(e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!coreReady) {
    console.log(`[SpeedTester] Core on port ${controllerPort} failed to boot in time.`);
  }

  const results = [];
  
  const pingNode = (node) => {
    return new Promise((resolve) => {
      const activeName = proxyConfigMap.get(node.id);
      const safeName = encodeURIComponent(activeName);
      const reqUrl = `http://127.0.0.1:${controllerPort}/proxies/${safeName}/delay?timeout=5000&url=http://www.gstatic.com/generate_204`;
      
      const req = http.get(reqUrl, (res) => {
        let output = '';
        res.on('data', c => output += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(output);
            if (parsed.delay !== undefined && parsed.delay > 0) {
              resolve({ id: node.id, latency: parsed.delay, status: 'ok' });
            } else {
              resolve({ id: node.id, latency: -1, status: 'error' });
            }
          } catch(e) {
            resolve({ id: node.id, latency: -1, status: 'error' });
          }
        });
      });
      req.on('error', () => resolve({ id: node.id, latency: -1, status: 'error' }));
      req.setTimeout(6000, () => { req.destroy(); resolve({ id: node.id, latency: -1, status: 'timeout' }); });
    });
  };

  try {
    const CONCURRENCY_LIMIT = 8;
    
    // We execute speed tests via a Promise Pool so we don't choke the OS/Mihomo outbound stack 
    // producing artificial latency jitter and timeouts
    const queue = [...nodes];
    
    async function worker() {
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node) continue;
        try {
          const res = await pingNode(node);
          results.push(res);
        } catch(e) {
          results.push({ id: node.id, latency: -1, status: 'error' });
        }
      }
    }

    const workers = [];
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
       workers.push(worker());
    }
    await Promise.all(workers);

  } finally {
    child.kill('SIGKILL');
    setTimeout(() => {
      try {
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      } catch(e) {}
    }, 1000);
  }

  return results;
}

module.exports = {
  testLatency
};
