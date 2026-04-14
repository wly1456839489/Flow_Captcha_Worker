const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'data.json');

class JSONDatabase {
  constructor() {
    this.data = this.read();
    this.nextNodeId = this.data.nodes.length > 0 ? Math.max(...this.data.nodes.map(d => d.id)) + 1 : 1;
  }
  
  read() {
    if (fs.existsSync(dbPath)) {
      try { 
        const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8')); 
        if (Array.isArray(parsed)) {
          // migrate old schema
          return { nodes: parsed, subscriptions: [], proxy_nodes: [] };
        }
        return parsed;
      } catch (e) {}
    }
    // Backward compatibility: try reading old nodes.json if exists
    const oldPath = path.join(__dirname, '..', 'nodes.json');
    if (fs.existsSync(oldPath)) {
      try { return { nodes: JSON.parse(fs.readFileSync(oldPath, 'utf8')), subscriptions: [], proxy_nodes: [] }; } catch(e){}
    }
    return { nodes: [], subscriptions: [], proxy_nodes: [] };
  }
  
  write() {
    fs.writeFileSync(dbPath, JSON.stringify(this.data, null, 2));
  }
  
  getAll(collection='nodes') {
    return this.data[collection] || [];
  }
  
  insert(host) {
    if (typeof host === 'string' && this.data.nodes.find(d => d.host === host)) throw new Error('Duplicate proxy host');
    // If host is an object (proxy node config), stringify or store it directly
    const record = { id: this.nextNodeId++, host, created_at: new Date().toISOString() };
    this.data.nodes.push(record);
    this.write();
    return record.id;
  }
  
  remove(id) {
    this.data.nodes = this.data.nodes.filter(d => d.id !== id);
    this.write();
  }

  // --- Subscriptions ---
  addSubscription(url, remark = '') {
    if (this.data.subscriptions.find(s => s.url === url)) throw new Error("Duplicate subscription URL");
    const sub = {
      id: crypto.randomUUID(),
      url,
      remark,
      updated_at: new Date().toISOString()
    };
    this.data.subscriptions.push(sub);
    this.write();
    return sub;
  }
  removeSubscription(id) {
    this.data.subscriptions = this.data.subscriptions.filter(s => s.id !== id);
    this.data.proxy_nodes = this.data.proxy_nodes.filter(n => n.subId !== id);
    this.write();
  }

  updateSubscription(id, url, remark) {
    const sub = this.data.subscriptions.find(s => s.id === id);
    if (!sub) throw new Error("Subscription not found");
    if (url && url !== sub.url) {
      if (this.data.subscriptions.find(s => s.url === url && s.id !== id)) throw new Error("Duplicate subscription URL");
      sub.url = url;
    }
    if (remark !== undefined) sub.remark = remark;
    sub.updated_at = new Date().toISOString();
    this.write();
    return sub;
  }

  updateWorkerStats(id, stats) {
    const node = this.data.nodes.find(d => d.id === id);
    if (node) {
      if (!node.stats) node.stats = { generated: 0, success: 0, failed: 0 };
      node.stats.generated = stats.generated;
      node.stats.success = stats.success;
      node.stats.failed = stats.failed;
      this.write();
    }
  }

  updateProxyNodes(subId, nodes) {
    const oldNodes = this.data.proxy_nodes.filter(n => n.subId === subId);
    // remove old
    this.data.proxy_nodes = this.data.proxy_nodes.filter(n => n.subId !== subId);
    // attach subId to new ones
    for(const n of nodes) {
      n.subId = subId;
      const oldMatch = oldNodes.find(o => o.name === n.name);
      if (oldMatch) {
         if (oldMatch.latency !== undefined) n.latency = oldMatch.latency;
         if (oldMatch.status !== undefined) n.status = oldMatch.status;
         if (oldMatch.flagged !== undefined) n.flagged = oldMatch.flagged;
      }
      this.data.proxy_nodes.push(n);
    }
    const sub = this.data.subscriptions.find(s => s.id === subId);
    if (sub) sub.updated_at = new Date().toISOString();
    this.write();
  }

  updateNodesStatus(updates) {
    const nodeMap = new Map();
    for (const update of updates) {
      nodeMap.set(update.id, update);
    }
    for (const node of this.data.proxy_nodes) {
      if (nodeMap.has(node.id)) {
        const u = nodeMap.get(node.id);
        node.latency = u.latency;
        node.status = u.status;
      }
    }
    this.write();
  }
}

module.exports = new JSONDatabase();
