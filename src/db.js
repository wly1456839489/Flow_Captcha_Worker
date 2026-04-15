const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const sqlitePath = path.join(__dirname, '..', 'data.sqlite');
const legacyJsonPath = path.join(__dirname, '..', 'data.json');
const legacyNodesPath = path.join(__dirname, '..', 'nodes.json');

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

class SQLiteDatabase {
  constructor() {
    this.db = new DatabaseSync(sqlitePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this._initSchema();
    this._migrateLegacyDataIfNeeded();
  }

  _withTransaction(fn) {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      throw error;
    }
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id INTEGER PRIMARY KEY,
        host_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        stats_json TEXT
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        remark TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proxy_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        server TEXT,
        config_json TEXT NOT NULL,
        sub_id TEXT NOT NULL,
        latency INTEGER,
        status TEXT,
        flagged INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (sub_id) REFERENCES subscriptions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_proxy_nodes_sub_id ON proxy_nodes(sub_id);
    `);
  }

  _hasAnyData() {
    const counts = [
      this.db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count,
      this.db.prepare('SELECT COUNT(*) AS count FROM subscriptions').get().count,
      this.db.prepare('SELECT COUNT(*) AS count FROM proxy_nodes').get().count,
    ];
    return counts.some((count) => count > 0);
  }

  _readLegacyData() {
    if (fs.existsSync(legacyJsonPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(legacyJsonPath, 'utf8'));
        if (Array.isArray(parsed)) {
          return { nodes: parsed, subscriptions: [], proxy_nodes: [] };
        }
        return {
          nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
          subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
          proxy_nodes: Array.isArray(parsed.proxy_nodes) ? parsed.proxy_nodes : [],
        };
      } catch {}
    }

    if (fs.existsSync(legacyNodesPath)) {
      try {
        return {
          nodes: JSON.parse(fs.readFileSync(legacyNodesPath, 'utf8')),
          subscriptions: [],
          proxy_nodes: [],
        };
      } catch {}
    }

    return { nodes: [], subscriptions: [], proxy_nodes: [] };
  }

  _migrateLegacyDataIfNeeded() {
    if (this._hasAnyData()) return;

    const legacy = this._readLegacyData();
    if (!legacy.nodes.length && !legacy.subscriptions.length && !legacy.proxy_nodes.length) return;

    const insertNode = this.db.prepare(`
      INSERT INTO nodes (id, host_json, created_at, stats_json)
      VALUES (@id, @host_json, @created_at, @stats_json)
    `);
    const insertSubscription = this.db.prepare(`
      INSERT INTO subscriptions (id, url, remark, updated_at)
      VALUES (@id, @url, @remark, @updated_at)
    `);
    const insertProxyNode = this.db.prepare(`
      INSERT INTO proxy_nodes (id, name, type, server, config_json, sub_id, latency, status, flagged, favorite)
      VALUES (@id, @name, @type, @server, @config_json, @sub_id, @latency, @status, @flagged, @favorite)
    `);

    this._withTransaction(() => {
      for (const node of legacy.nodes) {
        insertNode.run({
          id: node.id,
          host_json: toJson(node.host, null),
          created_at: node.created_at || new Date().toISOString(),
          stats_json: toJson(node.stats || { generated: 0, success: 0, failed: 0 }, null),
        });
      }

      for (const sub of legacy.subscriptions) {
        insertSubscription.run({
          id: sub.id || crypto.randomUUID(),
          url: sub.url,
          remark: sub.remark || '',
          updated_at: sub.updated_at || new Date().toISOString(),
        });
      }

      for (const node of legacy.proxy_nodes) {
        insertProxyNode.run({
          id: node.id || crypto.randomUUID(),
          name: node.name || 'Unnamed Node',
          type: node.type || 'unknown',
          server: node.server || null,
          config_json: toJson(node.config || {}, {}),
          sub_id: node.subId,
          latency: node.latency ?? null,
          status: node.status || null,
          flagged: node.flagged ? 1 : 0,
          favorite: node.favorite ? 1 : 0,
        });
      }
    });
  }

  _rowToNode(row) {
    return {
      id: row.id,
      host: safeJsonParse(row.host_json, null),
      created_at: row.created_at,
      stats: safeJsonParse(row.stats_json, { generated: 0, success: 0, failed: 0 }) || { generated: 0, success: 0, failed: 0 },
    };
  }

  _rowToSubscription(row) {
    return {
      id: row.id,
      url: row.url,
      remark: row.remark,
      updated_at: row.updated_at,
    };
  }

  _rowToProxyNode(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      server: row.server,
      config: safeJsonParse(row.config_json, {}),
      subId: row.sub_id,
      latency: row.latency,
      status: row.status,
      flagged: Boolean(row.flagged),
      favorite: Boolean(row.favorite),
    };
  }

  getAll(collection = 'nodes') {
    if (collection === 'nodes') {
      return this.db.prepare('SELECT * FROM nodes ORDER BY id ASC').all().map((row) => this._rowToNode(row));
    }
    if (collection === 'subscriptions') {
      return this.db.prepare('SELECT * FROM subscriptions ORDER BY updated_at DESC, id ASC').all().map((row) => this._rowToSubscription(row));
    }
    if (collection === 'proxy_nodes') {
      return this.db.prepare('SELECT * FROM proxy_nodes ORDER BY rowid ASC').all().map((row) => this._rowToProxyNode(row));
    }
    return [];
  }

  insert(host) {
    if (typeof host === 'string') {
      const existing = this.db.prepare('SELECT id FROM nodes WHERE host_json = ?').get(toJson(host, null));
      if (existing) throw new Error('Duplicate proxy host');
    }

    const createdAt = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO nodes (host_json, created_at, stats_json)
      VALUES (?, ?, ?)
    `).run(toJson(host, null), createdAt, toJson({ generated: 0, success: 0, failed: 0 }, null));

    return Number(result.lastInsertRowid);
  }

  remove(id) {
    this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  }

  addSubscription(url, remark = '') {
    const existing = this.db.prepare('SELECT id FROM subscriptions WHERE url = ?').get(url);
    if (existing) throw new Error('Duplicate subscription URL');

    const sub = {
      id: crypto.randomUUID(),
      url,
      remark,
      updated_at: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO subscriptions (id, url, remark, updated_at)
      VALUES (@id, @url, @remark, @updated_at)
    `).run(sub);

    return sub;
  }

  removeSubscription(id) {
    this._withTransaction(() => {
      this.db.prepare('DELETE FROM proxy_nodes WHERE sub_id = ?').run(id);
      this.db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
    });
  }

  updateSubscription(id, url, remark) {
    const sub = this.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
    if (!sub) throw new Error('Subscription not found');

    const nextUrl = url && url !== sub.url ? url : sub.url;
    if (nextUrl !== sub.url) {
      const conflict = this.db.prepare('SELECT id FROM subscriptions WHERE url = ? AND id != ?').get(nextUrl, id);
      if (conflict) throw new Error('Duplicate subscription URL');
    }

    const updated = {
      id,
      url: nextUrl,
      remark: remark !== undefined ? remark : sub.remark,
      updated_at: new Date().toISOString(),
    };

    this.db.prepare(`
      UPDATE subscriptions
      SET url = @url, remark = @remark, updated_at = @updated_at
      WHERE id = @id
    `).run(updated);

    return updated;
  }

  updateWorkerStats(id, stats) {
    this.db.prepare('UPDATE nodes SET stats_json = ? WHERE id = ?').run(
      toJson({
        generated: stats.generated || 0,
        success: stats.success || 0,
        failed: stats.failed || 0,
      }, null),
      id,
    );
  }

  updateProxyNodes(subId, nodes) {
    const oldNodes = this.getAll('proxy_nodes').filter((node) => node.subId === subId);
    const oldByName = new Map(oldNodes.map((node) => [node.name, node]));
    const insert = this.db.prepare(`
      INSERT INTO proxy_nodes (id, name, type, server, config_json, sub_id, latency, status, flagged, favorite)
      VALUES (@id, @name, @type, @server, @config_json, @sub_id, @latency, @status, @flagged, @favorite)
    `);

    this._withTransaction(() => {
      this.db.prepare('DELETE FROM proxy_nodes WHERE sub_id = ?').run(subId);

      for (const node of nodes) {
        const oldMatch = oldByName.get(node.name);
        insert.run({
          id: node.id || crypto.randomUUID(),
          name: node.name || 'Unnamed Node',
          type: node.type || 'unknown',
          server: node.server || null,
          config_json: toJson(node.config || {}, {}),
          sub_id: subId,
          latency: oldMatch?.latency ?? node.latency ?? null,
          status: oldMatch?.status ?? node.status ?? null,
          flagged: (oldMatch?.flagged ?? node.flagged) ? 1 : 0,
          favorite: (oldMatch?.favorite ?? node.favorite) ? 1 : 0,
        });
      }

      this.db.prepare('UPDATE subscriptions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), subId);
    });
  }

  updateNodesStatus(updates) {
    const stmt = this.db.prepare('UPDATE proxy_nodes SET latency = ?, status = ? WHERE id = ?');
    this._withTransaction(() => {
      for (const item of updates) {
        stmt.run(item.latency ?? null, item.status ?? null, item.id);
      }
    });
  }

  updateProxyNodeMeta(id, fields = {}) {
    const existing = this.db.prepare('SELECT * FROM proxy_nodes WHERE id = ?').get(id);
    if (!existing) throw new Error('Node not found');

    const flagged = fields.flagged !== undefined ? (fields.flagged ? 1 : 0) : existing.flagged;
    const favorite = fields.favorite !== undefined ? (fields.favorite ? 1 : 0) : existing.favorite;

    this.db.prepare('UPDATE proxy_nodes SET flagged = ?, favorite = ? WHERE id = ?').run(flagged, favorite, id);
    return this._rowToProxyNode({ ...existing, flagged, favorite });
  }

  write() {
    // Kept for compatibility with existing call sites.
  }
}

module.exports = new SQLiteDatabase();
