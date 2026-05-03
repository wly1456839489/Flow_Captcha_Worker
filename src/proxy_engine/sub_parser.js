const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const crypto = require('crypto');

const USER_AGENT_PROFILES = [
  { label: 'clash-verge', userAgent: 'clash-verge/v1.7.7' },
  { label: 'mihomo', userAgent: 'Mihomo/1.18.9' },
  { label: 'clash-meta', userAgent: 'Clash.Meta/1.18.9' },
  { label: 'clash-for-windows', userAgent: 'ClashforWindows/0.20.39' },
  { label: 'v2rayN', userAgent: 'v2rayN/6.23' },
  { label: 'default', userAgent: null }
];

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
}

function decodeFilename(contentDisposition) {
  if (!contentDisposition) return null;

  const starMatch = contentDisposition.match(/filename\*=([^;]+)/i);
  if (starMatch && starMatch[1]) {
    const value = starMatch[1].trim().replace(/^UTF-\d+''/i, '').replace(/^"|"$/g, '');
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  const match = contentDisposition.match(/filename="?([^;\n"]+)"?/i);
  if (!match || !match[1]) return null;

  try {
    return decodeURIComponent(match[1].trim());
  } catch (_) {
    return match[1].trim();
  }
}

function resolveRedirect(baseUrl, location) {
  try {
    return new URL(location, baseUrl).toString();
  } catch (_) {
    return location;
  }
}

async function fetchSub(url, options = {}) {
  const { userAgent = USER_AGENT_PROFILES[0].userAgent } = options;

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const headers = {};
    if (userAgent) headers['User-Agent'] = userAgent;

    const req = client.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchSub(resolveRedirect(url, res.headers.location), options));
        return;
      }

      const filename = decodeFilename(res.headers['content-disposition']);
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
      reject(new Error('Timeout fetching subscription'));
    });
    req.setTimeout(15000);
  });
}

function toNode(proxy) {
  return {
    id: makeId(),
    name: proxy.name || 'Unnamed',
    type: proxy.type || 'unknown',
    server: proxy.server,
    config: proxy
  };
}

function parseClashYaml(data) {
  const parsed = yaml.load(data);

  if (!parsed || !Array.isArray(parsed.proxies) || parsed.proxies.length === 0) {
    return [];
  }

  return parsed.proxies
    .filter(proxy => proxy && typeof proxy === 'object')
    .map(toNode);
}

function decodeMaybeBase64(data) {
  const compact = String(data || '').replace(/\s+/g, '');
  if (!compact) return null;

  try {
    const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8').trim();
    return /^[a-z0-9+.-]+:\/\//im.test(decoded) ? decoded : null;
  } catch (_) {
    return null;
  }
}

function boolParam(searchParams, names) {
  return names.some((name) => {
    const value = searchParams.get(name);
    return value === '1' || value === 'true';
  });
}

function parseUriNode(line) {
  let url;
  try {
    url = new URL(line);
  } catch (_) {
    return null;
  }

  const type = url.protocol.replace(':', '').toLowerCase();
  const name = url.hash ? decodeURIComponent(url.hash.slice(1)) : `${type}-${url.hostname}:${url.port}`;
  const port = Number(url.port);
  if (!url.hostname || !port) return null;

  if (type === 'anytls') {
    const config = {
      name,
      type: 'anytls',
      server: url.hostname,
      port,
      password: decodeURIComponent(url.username || ''),
      udp: true
    };

    const sni = url.searchParams.get('sni') || url.searchParams.get('peer');
    if (sni) config.sni = sni;
    if (boolParam(url.searchParams, ['insecure', 'allowInsecure'])) config['skip-cert-verify'] = true;

    return toNode(config);
  }

  if (type === 'trojan') {
    const config = {
      name,
      type: 'trojan',
      server: url.hostname,
      port,
      password: decodeURIComponent(url.username || ''),
      udp: true
    };

    const sni = url.searchParams.get('sni') || url.searchParams.get('peer');
    if (sni) config.sni = sni;
    if (boolParam(url.searchParams, ['insecure', 'allowInsecure'])) config['skip-cert-verify'] = true;

    return toNode(config);
  }

  return null;
}

function parseShareLinks(data) {
  const text = decodeMaybeBase64(data) || String(data || '');
  const nodes = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !/^[a-z0-9+.-]+:\/\//i.test(line)) continue;

    const node = parseUriNode(line);
    if (node) nodes.push(node);
  }

  return nodes;
}

function parseSubscriptionData(data) {
  try {
    const clashNodes = parseClashYaml(data);
    if (clashNodes.length > 0) return clashNodes;
  } catch (_) {
    // Not YAML, fall through to common share-link subscriptions.
  }

  return parseShareLinks(data);
}

async function parseClashSub(url) {
  const failures = [];
  const emptyProfiles = [];

  for (const profile of USER_AGENT_PROFILES) {
    try {
      const { data, filename } = await fetchSub(url, { userAgent: profile.userAgent });
      const nodes = parseSubscriptionData(data);

      if (nodes.length > 0) {
        return { nodes, filename };
      }

      emptyProfiles.push(profile.label);
    } catch (err) {
      failures.push(`${profile.label}: ${err.message}`);
    }
  }

  const detail = failures.length > 0 ? ` Last error: ${failures[failures.length - 1]}` : '';
  const tried = emptyProfiles.length > 0 ? ` Empty responses from: ${emptyProfiles.join(', ')}.` : '';
  throw new Error(`Subscription fetch or parse failed: no valid proxy nodes were found.${tried}${detail}`);
}

module.exports = {
  fetchSub,
  parseClashSub,
  parseSubscriptionData
};
