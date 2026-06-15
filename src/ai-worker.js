// Web Worker: loads Transformers.js and runs AI reranking off the main thread.

import { AutoTokenizer, AutoModel } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/multilingual-e5-small';
let loadedTokenizer = null;
let loadedModel = null;

function wlog(level, ...args) {
  const text = args.map(a =>
    a === null ? 'null'
    : typeof a === 'object' ? JSON.stringify(a)
    : String(a)
  ).join(' ');
  self.postMessage({ type: 'log', level, text });
}

async function loadModel() {
  if (loadedTokenizer && loadedModel) return { tokenizer: loadedTokenizer, model: loadedModel };

  const t0 = Date.now();
  wlog('log', 'モデルロード開始...');

  loadedTokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
  wlog('log', 'トークナイザ完了');

  try {
    loadedModel = await AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8' });
    wlog('log', `モデルロード完了 q8 (${Date.now() - t0}ms)`);
  } catch (e) {
    wlog('warn', `q8失敗 → fp32フォールバック: ${e.message}`);
    loadedModel = await AutoModel.from_pretrained(MODEL_ID);
    wlog('log', `モデルロード完了 fp32 (${Date.now() - t0}ms)`);
  }

  self.postMessage({ type: 'ready' });
  return { tokenizer: loadedTokenizer, model: loadedModel };
}

async function embedTexts(texts) {
  const { tokenizer, model } = await loadModel();

  const inputs = await tokenizer(texts, {
    padding: true,
    truncation: true,
    max_length: 64,
  });

  const outputs = await model(inputs);

  const keys = Object.keys(outputs);
  wlog('log', '出力keys:', keys.join(', '));

  // StaticEmbedding outputs sentence_embedding [batch, hidden] directly.
  // Fall back to last_hidden_state [batch, seq, hidden] if needed.
  const raw = outputs.sentence_embedding
    ?? outputs.sentence_embeddings
    ?? outputs.last_hidden_state
    ?? outputs.logits
    ?? (keys.length > 0 ? outputs[keys[0]] : null);

  if (!raw) throw new Error('出力テンソルが見つかりません: ' + keys.join(', '));

  wlog('log', 'テンソルshape:', (raw.dims ?? []).join('x'));

  if (raw.dims.length === 2) {
    // [batch, hidden] — already pooled
    return extractFrom2D(raw, texts.length);
  } else if (raw.dims.length === 3) {
    // [batch, seq, hidden] — apply mean pooling
    return meanPool(raw, inputs.attention_mask, texts.length);
  } else {
    throw new Error('未対応shape: ' + raw.dims.join('x'));
  }
}

function extractFrom2D(tensor, batchSize) {
  const hiddenSize = tensor.dims[1];
  const flat = tensor.data;
  return Array.from({ length: batchSize }, (_, i) => {
    const start = i * hiddenSize;
    const slice = flat.subarray ? flat.subarray(start, start + hiddenSize) : flat.slice(start, start + hiddenSize);
    return normalizeVec(Array.from(slice));
  });
}

function meanPool(tensor, attentionMask, batchSize) {
  const [, seq, hidden] = tensor.dims;
  const tokenData = tensor.data;
  const maskData = attentionMask.data;

  return Array.from({ length: batchSize }, (_, i) => {
    const emb = new Float32Array(hidden);
    let count = 0;
    for (let j = 0; j < seq; j++) {
      if (maskData[i * seq + j] === 0) continue;
      count++;
      const offset = (i * seq + j) * hidden;
      for (let k = 0; k < hidden; k++) emb[k] += tokenData[offset + k];
    }
    if (count > 0) for (let k = 0; k < hidden; k++) emb[k] /= count;
    return normalizeVec(Array.from(emb));
  });
}

function normalizeVec(v) {
  let sq = 0;
  for (const x of v) sq += x * x;
  const n = Math.sqrt(sq);
  return n > 0 ? v.map(x => x / n) : v;
}

function cosine(a, b) {
  if (!a.length || !b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function rerank(payload) {
  const { candidates, left, right, okuriKana } = payload;
  const t0 = Date.now();

  const rightSnippet = right ? right.slice(0, 8) : '';
  wlog('log', `リランク開始: ${candidates.slice(0, 5).join('/')} | 左="${left.slice(-8)}" 右="${rightSnippet}"`);

  const queryText = `query: ${left.slice(-20)}${rightSnippet ? '…' + rightSnippet : ''}`;
  const passages = candidates.map(c => `passage: ${c}${okuriKana || ''}`);
  const texts = [...passages, queryText];

  const embeddings = await embedTexts(texts);
  const queryEmbedding = embeddings[embeddings.length - 1];

  wlog('log', `クエリ: "${queryText}"`);

  const scored = candidates.map((candidate, index) => {
    const embScore = cosine(embeddings[index], queryEmbedding);
    return { candidate, score: embScore, embScore, originalIndex: index };
  });

  scored.sort((a, b) => b.score - a.score);

  const timeMs = Date.now() - t0;
  wlog('log', `完了 ${timeMs}ms: ${scored.map(s => s.candidate).join(' > ')}`);

  return {
    ranked: scored.map(x => x.candidate),
    debug: { modelId: MODEL_ID, timeMs, strategy: 'e5-query-passage', scores: scored },
  };
}

self.onmessage = async (event) => {
  const { type, id, payload } = event.data;
  if (type !== 'rerank') return;

  try {
    const result = await rerank(payload);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    wlog('error', 'リランクエラー:', err.message);
    self.postMessage({ id, ok: false, error: err.message });
  }
};

// Pre-warm
loadModel().catch(e => wlog('error', 'モデルロードエラー:', e.message));
