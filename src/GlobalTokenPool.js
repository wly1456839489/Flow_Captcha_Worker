const BrowserWorker = require('./BrowserWorker');
const db = require('./db');

class GlobalTokenPool {
  constructor() {
    this.workers = [];
    this.waitQueue = [];
    this.projectFailedNodes = new Map();
  }

  _saveWorkerStats(worker) {
    db.updateWorkerStats(worker.nodeId, worker.stats);
  }

  reportError(nodeId, projectId) {
    const worker = this.workers.find(w => w.nodeId === nodeId);
    if (worker && !worker.isShuttingDown) {
      worker.stats.failed++;
      this._saveWorkerStats(worker);
      console.log(`\x1b[33m[Pool]\x1b[0m 🛑 检测到 Node-${nodeId} 业务验证失败，触发紧急自毁重建指令！`);
      worker._handleRestart().catch(() => { });
    }
    if (projectId) {
      if (!this.projectFailedNodes.has(projectId)) this.projectFailedNodes.set(projectId, new Set());
      this.projectFailedNodes.get(projectId).add(nodeId);
      setTimeout(() => {
        if (this.projectFailedNodes.has(projectId)) {
          this.projectFailedNodes.get(projectId).delete(nodeId);
        }
      }, 300000);
    }
  }

  reportSuccess(nodeId) {
    const worker = this.workers.find(w => w.nodeId === nodeId);
    if (worker && !worker.isShuttingDown) {
      worker.stats.success++;
      this._saveWorkerStats(worker);
    }
  }

  async init() {
    const proxies = db.getAll();
    const initPromises = [];
    for (const record of proxies) {
      const worker = new BrowserWorker(record.id, record.host, record.stats);
      this.workers.push(worker);
      initPromises.push(worker.init().catch(e => {
        console.error(`\x1b[36m[Node-${worker.nodeId}]\x1b[0m \x1b[31m❌ 初次 Init failed:\x1b[0m`, e.message);
        worker._handleRestart().catch(() => { });
      }));
    }
    await Promise.all(initPromises);
    this._runManager();
  }

  async addNode(proxyHost) {
    let nodeId;
    try {
      nodeId = db.insert(proxyHost);
    } catch (e) {
      throw new Error(`Database error: ${e.message}`);
    }
    
    const worker = new BrowserWorker(nodeId, proxyHost);
    this.workers.push(worker);
    worker.init().catch(e => {
      console.error(`\x1b[36m[Node-${nodeId}]\x1b[0m \x1b[31m❌ 初次动态 Init failed:\x1b[0m`, e.message);
      worker._handleRestart().catch(() => { });
    });
    console.log(`\x1b[33m[Pool]\x1b[0m ➕ 正在同步挂载持久化新节点 Node-${nodeId}...`);
    return nodeId;
  }

  async removeNode(nodeId) {
    const workerIndex = this.workers.findIndex(w => w.nodeId === nodeId);
    if (workerIndex === -1) throw new Error("Node not currently active in pool");
    
    db.remove(nodeId);

    const worker = this.workers[workerIndex];
    worker.isShuttingDown = true;
    worker.ready = false;
    
    console.log(`\x1b[33m[Pool]\x1b[0m ➖ 动态下线并从数据库剔除节点 Node-${nodeId}...`);

    worker.shutdown().catch(() => {}).finally(() => {
        const recheckIndex = this.workers.findIndex(w => w.nodeId === nodeId);
        if (recheckIndex !== -1) {
            this.workers.splice(recheckIndex, 1);
        }
    });
  }

  _wakeupIdles() {
    const needed = this.waitQueue.length;
    if (needed > 0) {
      const idles = this.workers.filter(w => w.ready && !w.isFetching && !w.isShuttingDown);
      if (idles.length === 0) return;

      for (let i = idles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idles[i], idles[j]] = [idles[j], idles[i]];
      }

      idles.sort((a, b) => a.stats.generated - b.stats.generated);

      const load = Math.min(idles.length, needed);
      for (let i = 0; i < load; i++) {
        this._dispatchTask(idles[i]);
      }
    }
  }

  _runManager() {
    setInterval(() => {
      this._wakeupIdles();
    }, 500);
  }

  async _dispatchTask(worker) {
    if (worker.isFetching || !worker.ready || worker.isShuttingDown) return;

    let targetAction = '';
    let waiterIdx = -1;
    for (let i = 0; i < this.waitQueue.length; i++) {
      const w = this.waitQueue[i];
      const avoidNodes = w.projectId ? (this.projectFailedNodes.get(w.projectId) || new Set()) : new Set();
      if (!avoidNodes.has(worker.nodeId)) {
        waiterIdx = i;
        targetAction = w.action;
        break;
      }
    }

    if (waiterIdx === -1) return;

    const waiter = this.waitQueue.splice(waiterIdx, 1)[0];
    worker.isFetching = true;
    worker.stats.generated++;
    this._saveWorkerStats(worker);

    try {
      const entry = await worker.executeToken(targetAction);
      console.log(`\x1b[36m[Pool]\x1b[0m ⚡ 实时调度生成 Token 并成功下发 (action=${targetAction})`);
      waiter.resolve(entry);
    } catch (e) {
      this.waitQueue.unshift(waiter);
    } finally {
      worker.isFetching = false;
      if (!worker.isShuttingDown) {
        worker.ready = false;
        console.log(`\x1b[33m[Pool]\x1b[0m ♻️ 任务结束，强制重置：销毁 Node-${worker.nodeId} 并生成全新指纹...`);
        worker._handleRestart().catch(() => { });
        this._wakeupIdles();
      }
    }
  }

  getToken(timeoutMs = 120000, action = 'IMAGE_GENERATION', projectId = null) {
    console.log(`\x1b[36m[Pool]\x1b[0m \x1b[33m⏳ 收到请求，立刻唤醒就绪空闲节点执行 Token 生成任务... (action=${action})\x1b[0m`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waitQueue.findIndex(w => w.resolve === resolve);
        if (i !== -1) this.waitQueue.splice(i, 1);
        reject(new Error('Token request timed out (' + timeoutMs + 'ms)'));
      }, timeoutMs);

      this.waitQueue.push({
        action,
        projectId,
        resolve: (entry) => { clearTimeout(timer); resolve(entry); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });

      this._wakeupIdles();
    });
  }
}

module.exports = GlobalTokenPool;
