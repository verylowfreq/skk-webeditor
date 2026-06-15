// Main-thread wrapper for the AI reranker Web Worker.

export class AIReranker {
  constructor() {
    this._worker = null;
    this._nextId = 1;
    this._pending = new Map();
    this._ready = false;
    this._initError = null;
    this.onLog = null; // callback(level, text)
  }

  init() {
    try {
      this._worker = new Worker(new URL('./ai-worker.js', import.meta.url), {
        type: 'module',
      });

      this._worker.onmessage = (event) => {
        const { type, id, ok, result, error, level, text } = event.data;

        if (type === 'log') {
          if (this.onLog) this.onLog(level ?? 'log', text ?? '');
          return;
        }

        if (type === 'ready') {
          this._ready = true;
          if (this.onLog) this.onLog('log', '[AIReranker] worker ready');
          return;
        }

        if (type === 'error' && !id) {
          this._initError = error;
          if (this.onLog) this.onLog('error', '[AIReranker] init error: ' + error);
          for (const [, item] of this._pending) item.reject(new Error(error));
          this._pending.clear();
          return;
        }

        const item = this._pending.get(id);
        if (!item) return;
        this._pending.delete(id);
        if (ok) item.resolve(result);
        else item.reject(new Error(error || 'AI rerank failed'));
      };

      this._worker.onerror = (e) => {
        this._initError = e.message;
        if (this.onLog) this.onLog('error', '[AIReranker] worker error: ' + e.message);
        for (const [, item] of this._pending) item.reject(new Error(e.message));
        this._pending.clear();
      };
    } catch (e) {
      this._initError = e.message;
      if (this.onLog) this.onLog('error', '[AIReranker] worker 作成失敗: ' + e.message);
    }
  }

  get isAvailable() {
    return this._worker !== null && this._initError === null;
  }

  rerank(payload) {
    if (!this._worker || this._initError) {
      return Promise.reject(new Error('AI worker not available'));
    }
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ type: 'rerank', id, payload });
    });
  }

  rerankWithTimeout(payload) {
    const timeoutMs = payload.timeoutMs ?? 300;
    return Promise.race([
      this.rerank(payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI rerank timeout')), timeoutMs)
      ),
    ]);
  }
}
