// Main-thread wrapper for the AI reranker Web Worker.
// Sends rerank requests to the worker and returns results as promises.

export class AIReranker {
  constructor() {
    this._worker = null;
    this._nextId = 1;
    this._pending = new Map();
    this._ready = false;
    this._initError = null;
  }

  init() {
    try {
      this._worker = new Worker(new URL('./ai-worker.js', import.meta.url), {
        type: 'module',
      });

      this._worker.onmessage = (event) => {
        const { type, id, ok, result, error } = event.data;

        if (type === 'ready') {
          this._ready = true;
          console.log('[AIReranker] worker ready');
          return;
        }

        if (type === 'error' && !id) {
          this._initError = error;
          console.warn('[AIReranker] worker init error:', error);
          // Reject all pending
          for (const [, item] of this._pending) {
            item.reject(new Error(error));
          }
          this._pending.clear();
          return;
        }

        const item = this._pending.get(id);
        if (!item) return;
        this._pending.delete(id);

        if (ok) {
          item.resolve(result);
        } else {
          item.reject(new Error(error || 'AI rerank failed'));
        }
      };

      this._worker.onerror = (e) => {
        console.warn('[AIReranker] worker error:', e.message);
        this._initError = e.message;
        for (const [, item] of this._pending) {
          item.reject(new Error(e.message));
        }
        this._pending.clear();
      };
    } catch (e) {
      console.warn('[AIReranker] failed to create worker:', e);
      this._initError = e.message;
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
