const RECAPTCHA_SITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 9060;
const TARGET_URL = 'https://labs.google/fx/tools/flow';
const API_KEY = process.env.API_KEY || 'flow2api_secret';

// Proxy configs (username and password)
const PROXY_USER = process.env.PROXY_USER || 'your_proxy_username';
const PROXY_PASS = process.env.PROXY_PASS || 'your_proxy_password';

// Initial Seed Proxies.
// If this array is non-empty, the system will automatically boot these nodes on startup.
// If empty, the system starts with zero nodes and waits for API /cluster/nodes dynamic additions.
const PROXIES = [
  // Add your rotating proxy IP:PORT here. Example:
  // "192.168.1.100:8080",
];

const POOL_CONFIG = {
  maxSizePerNode: 5,
  minSizePerNode: 1,
  minInterval: 5000,
  tokenTTL: 110000,
  staggerMs: 3000,
};

module.exports = {
  RECAPTCHA_SITE_KEY,
  PORT,
  TARGET_URL,
  API_KEY,
  PROXY_USER,
  PROXY_PASS,
  PROXIES,
  POOL_CONFIG
};
