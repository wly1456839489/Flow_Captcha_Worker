const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const crypto = require('crypto');

async function fetchSub(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'ClashforWindows/0.20.39'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirect
        resolve(fetchSub(res.headers.location));
        return;
      }
      let filename = null;
      if (res.headers['content-disposition']) {
        // matches filename="iKuuu_V2.yaml" or filename*=UTF-8''iKuuu_V2.yaml
        let m = res.headers['content-disposition'].match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\n"']+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1].trim());
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Server returned ${res.statusCode}: ${data}`));
          return;
        }
        resolve({ data, filename });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error("Timeout fetching subscription"));
    });
    req.setTimeout(15000);
  });
}

async function parseClashSub(url) {
  try {
    const { data, filename } = await fetchSub(url);
    const parsed = yaml.load(data);
    
    if (parsed && Array.isArray(parsed.proxies)) {
      // It's a clash config
      const nodes = parsed.proxies.map(p => ({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        name: p.name || 'Unnamed',
        type: p.type || 'unknown',
        server: p.server,
        config: p // The raw clash format proxy node descriptor
      }));
      return { nodes, filename };
    } else {
      // If the parsed YAML does not contain the 'proxies' array
      throw new Error("未能从该订阅源中提取到有效的节点信息，请检查链接是否能够正常访问或是否包含代理节点数据。");
    }
  } catch (err) {
    // Distinguish timeout or networking issues easily
    throw new Error(`订阅拉取或解析失败: ${err.message}`);
  }
}

module.exports = {
  fetchSub,
  parseClashSub
};
