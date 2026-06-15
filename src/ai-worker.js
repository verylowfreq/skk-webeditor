// Web Worker: loads Transformers.js and runs AI reranking off the main thread.
// Receives { type: "rerank", id, payload } messages, replies with results.

import { pipeline } from '@huggingface/transformers';

const MODEL_ID = 'cfsdwe/static-embedding-japanese-ONNX-for-js';
let embedderPromise = null;

async function detectDevice() {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch (e) {
      // WebGPU not available
    }
  }
  return 'wasm';
}

async function loadEmbedder() {
  if (embedderPromise) return embedderPromise;

  embedderPromise = (async () => {
    // Start with WASM for stability; WebGPU can be enabled after validation
    const device = await detectDevice();
    try {
      const emb = await pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
        device,
      });
      self.postMessage({ type: 'ready' });
      return emb;
    } catch (err) {
      if (device === 'webgpu') {
        console.warn('[ai-worker] WebGPU failed, retrying with WASM:', err);
        const emb = await pipeline('feature-extraction', MODEL_ID, {
          dtype: 'q8',
          device: 'wasm',
        });
        self.postMessage({ type: 'ready' });
        return emb;
      }
      throw err;
    }
  })().catch(err => {
    embedderPromise = null;
    self.postMessage({ type: 'error', error: err.message });
    throw err;
  });

  return embedderPromise;
}

// Extract 2D float array from pipeline output tensor
function extractEmbeddings(tensor, count) {
  const hiddenSize = tensor.dims[1];
  const embeddings = [];
  for (let i = 0; i < count; i++) {
    embeddings.push(Array.from(tensor.data.subarray(i * hiddenSize, (i + 1) * hiddenSize)));
  }
  return embeddings;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function shapeScore(candidate) {
  let s = 0;
  if (/[一-鿿]/.test(candidate)) s += 0.2;
  if (!candidate) s -= 1;
  if (candidate.length > 12) s -= 0.1;
  return s;
}

function makeCandidateWindow({ left, candidate, okuriKana, right }) {
  const l = left.slice(-12);
  const r = right.slice(0, 12);
  return `${l}${candidate}${okuriKana || ''}${r}`;
}

async function rerank(payload) {
  const { candidates, left, right, okuriKana } = payload;
  const t0 = Date.now();

  const embedder = await loadEmbedder();

  const windows = candidates.map(candidate =>
    makeCandidateWindow({ left, candidate, okuriKana, right })
  );

  const contextText = `${left.slice(-12)}${right.slice(0, 12)}` || left.slice(-24) || '日本語';
  const texts = [...windows, contextText];

  const output = await embedder(texts, { pooling: 'mean', normalize: true });
  const embeddings = extractEmbeddings(output, texts.length);
  const contextEmbedding = embeddings[embeddings.length - 1];

  const scored = candidates.map((candidate, index) => {
    const embScore = cosine(embeddings[index], contextEmbedding);
    const dictScore = 1 / (index + 1);
    const shape = shapeScore(candidate);
    const score = 0.55 * embScore + 0.30 * dictScore + 0.15 * shape;
    return { candidate, score, embScore, dictScore, shape, originalIndex: index, window: windows[index] };
  });

  scored.sort((a, b) => b.score - a.score);

  const timeMs = Date.now() - t0;

  return {
    ranked: scored.map(x => x.candidate),
    debug: {
      modelId: MODEL_ID,
      timeMs,
      strategy: 'local-window',
      scores: scored,
    },
  };
}

self.onmessage = async (event) => {
  const { type, id, payload } = event.data;
  if (type !== 'rerank') return;

  try {
    const result = await rerank(payload);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};

// Pre-warm: start model loading immediately when worker starts
loadEmbedder().catch(() => {});
