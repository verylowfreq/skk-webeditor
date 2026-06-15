// Main application logic

import { SKKEngine } from './skk-engine.js';
import { Dictionary, parseSKKJisyo, parseSKKJisyoUTF8 } from './dictionary.js';
import { AIReranker } from './ai-reranker.js';

// ── Mobile console ────────────────────────────────────────────────

function appendLog(level, text) {
  const el = document.getElementById('console-log');
  if (!el) return;

  const line = document.createElement('div');
  line.className = `console-line console-${level}`;
  const time = new Date().toTimeString().slice(0, 8);
  line.textContent = `[${time}] ${text}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;

  while (el.children.length > 300) el.removeChild(el.firstChild);
}

function setupMobileConsole() {
  // Mirror console methods to on-screen panel
  for (const level of ['log', 'warn', 'error', 'info']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      appendLog(level, args.map(a =>
        a === null ? 'null'
        : typeof a === 'object' ? (() => { try { return JSON.stringify(a); } catch { return String(a); } })()
        : String(a)
      ).join(' '));
    };
  }

  const btn = document.getElementById('btn-console-clear');
  if (btn) btn.addEventListener('click', () => {
    const el = document.getElementById('console-log');
    if (el) el.innerHTML = '';
  });
}

let engine = null;
let dict = null;
let aiReranker = null;

const $ = id => document.getElementById(id);
const ta = () => $('confirmed-text');

let lastValue = '';
let lastSelStart = 0;

let capsLockOn = false;
let capsLockComp = false;

// AI rerank deduplication
let rerankRequestId = 0;
let lastRerankKey = '';

function makeRerankKey() {
  return [
    engine.reading,
    engine.okuriKana,
    engine.candidates.slice(0, 5).join('\t'),
  ].join('|');
}

// ── AI settings ───────────────────────────────────────────────────

const aiSettings = { leftCtx: 40, rightCtx: 20, timeoutMs: 300 };

function loadAISettings() {
  try {
    const saved = localStorage.getItem('skkEditor_aiSettings');
    if (saved) Object.assign(aiSettings, JSON.parse(saved));
  } catch {}
  syncSettingsUI();
}

function saveAISettings() {
  try { localStorage.setItem('skkEditor_aiSettings', JSON.stringify(aiSettings)); } catch {}
}

function syncSettingsUI() {
  const set = (id, val) => { const el = $(id); if (el) el.value = val; };
  const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('left-ctx', aiSettings.leftCtx);   txt('left-ctx-val', aiSettings.leftCtx);
  set('right-ctx', aiSettings.rightCtx); txt('right-ctx-val', aiSettings.rightCtx);
  set('timeout-ms', aiSettings.timeoutMs); txt('timeout-val', aiSettings.timeoutMs);
}

function setupAISettings() {
  const wire = (sliderId, valId, key) => {
    const el = $(sliderId);
    if (!el) return;
    el.addEventListener('input', () => {
      aiSettings[key] = parseInt(el.value, 10);
      const valEl = $(valId);
      if (valEl) valEl.textContent = aiSettings[key];
      saveAISettings();
      lastRerankKey = ''; // force rerank with new settings
    });
  };
  wire('left-ctx',   'left-ctx-val',  'leftCtx');
  wire('right-ctx',  'right-ctx-val', 'rightCtx');
  wire('timeout-ms', 'timeout-val',   'timeoutMs');
}

// ── Context helpers ───────────────────────────────────────────────

function getLeftContext(n) {
  const el = ta();
  const pos = el.selectionStart;
  return el.value.slice(Math.max(0, pos - n), pos);
}

function getRightContext(n) {
  const el = ta();
  const pos = el.selectionEnd;
  return el.value.slice(pos, pos + n);
}

// ── AI reranking ──────────────────────────────────────────────────

async function maybeRerankCandidates() {
  if (!aiReranker || !aiReranker.isAvailable) return;
  if (engine.mode !== 'converting') return;

  const candidates = engine.candidates;
  if (!Array.isArray(candidates) || candidates.length <= 1) return;

  const key = makeRerankKey();
  if (key === lastRerankKey) return;
  lastRerankKey = key;

  const requestId = ++rerankRequestId;

  const topCandidates = candidates.slice(0, 5);
  const restCandidates = candidates.slice(5);

  const left = getLeftContext(aiSettings.leftCtx);
  const right = getRightContext(aiSettings.rightCtx);

  try {
    const result = await aiReranker.rerankWithTimeout({
      left,
      right,
      reading: engine.reading,
      okuriKana: engine.okuriKana,
      candidates: topCandidates,
      timeoutMs: aiSettings.timeoutMs,
    });

    if (requestId !== rerankRequestId) return;
    if (engine.mode !== 'converting') return;

    const rankedAll = [...result.ranked, ...restCandidates];
    engine.setCandidates(rankedAll, 'ai-rerank');

    updateAIBadge(true);
    updateDebugInfo(result.debug);
  } catch (e) {
    if (e.message !== 'AI rerank timeout') {
      console.warn('[AI rerank skipped]', e.message);
    }
  }
}

// ── Debug UI ──────────────────────────────────────────────────────

function updateAIBadge(active) {
  const badge = $('ai-badge');
  if (badge) badge.style.display = active ? 'inline-block' : 'none';
}

function updateDebugInfo(debug) {
  const el = $('debug-info');
  if (!el || !debug) return;

  const modelShort = debug.modelId.split('/').pop();
  const lines = [
    `model: ${modelShort}  time: ${debug.timeMs}ms`,
    `文脈: 左${aiSettings.leftCtx}字 右${aiSettings.rightCtx}字  timeout: ${aiSettings.timeoutMs}ms`,
    `式: cosine("query: 左文脈", "passage: 候補")`,
    `${'─'.repeat(44)}`,
    ...debug.scores.slice(0, 5).map((s, i) => {
      const cand = [...s.candidate].slice(0, 4).join('');
      return `  ${i + 1}. ${cand.padEnd(5)} emb=${s.embScore.toFixed(4)}`;
    }),
  ];

  el.textContent = lines.join('\n');
}

// ── CapsLock ──────────────────────────────────────────────────────

function loadCapsLockComp() {
  capsLockComp = localStorage.getItem('skkEditor_capsLockComp') === 'true';
  updateCapsLockUI();
}

function saveCapsLockComp() {
  localStorage.setItem('skkEditor_capsLockComp', capsLockComp);
}

function updateCapsLockUI() {
  const el = $('capslock-indicator');
  if (capsLockOn && capsLockComp) {
    el.dataset.state = 'both';
    el.textContent = 'CAPS↺';
  } else if (capsLockOn) {
    el.dataset.state = 'on';
    el.textContent = 'CAPS';
  } else if (capsLockComp) {
    el.dataset.state = 'comp';
    el.textContent = 'CAPS↺';
  } else {
    delete el.dataset.state;
  }
}

// ── Initialisation ────────────────────────────────────────────────

function init() {
  setupMobileConsole();

  dict = new Dictionary();
  engine = new SKKEngine(dict);
  engine.onChange = render;

  aiReranker = new AIReranker();
  aiReranker.onLog = (level, text) => appendLog(level, text);
  aiReranker.init();

  loadAISettings();
  setupAISettings();

  loadBottomOffset();
  loadCapsLockComp();
  loadTextFromStorage();
  syncSnapshot();
  render();
  setupEvents();
  setupBottomHandle();
  initDictionary();
}

async function initDictionary() {
  const statusEl = $('dict-status');
  const progressBar = $('dict-progress');
  const progressWrap = $('dict-progress-wrap');

  statusEl.textContent = '辞書をダウンロード中…';
  progressWrap.style.display = 'block';

  try {
    const result = await dict.init(pct => {
      if (pct >= 0) progressBar.value = Math.round(pct * 100);
      else progressBar.removeAttribute('value');
    });

    progressWrap.style.display = 'none';
    if (result.source === 'cache') {
      statusEl.textContent = `辞書: キャッシュ済み (${result.count.toLocaleString()} 語)`;
    } else if (result.source === 'download') {
      statusEl.textContent = `辞書: ダウンロード完了 (${result.count.toLocaleString()} 語)`;
    } else {
      statusEl.textContent = `辞書: 内蔵ミニ辞書 (${result.count} 語)`;
    }
  } catch (e) {
    progressWrap.style.display = 'none';
    statusEl.textContent = '辞書: 内蔵ミニ辞書';
  }
}

// ── Rendering ─────────────────────────────────────────────────────

function render() {
  $('composition-text').textContent = engine.compositionText || '';
  $('mode-label').textContent = engine.modeLabel;

  const cands = engine.candidates;
  const candRow = $('candidates-row');
  const candList = $('candidates-list');

  if (cands.length > 0 && engine.mode === 'converting') {
    candRow.style.display = 'flex';
    candList.innerHTML = '';
    cands.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'cand-btn' + (i === engine.candidateIdx ? ' selected' : '');
      btn.textContent = (i + 1 <= 9 ? `${i + 1}.` : '') + c + engine.okuriKana;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        const result = engine.selectCandidate(i);
        if (result.commit) insertAtCursor(result.commit);
        lastRerankKey = '';
        updateAIBadge(false);
        focusInput();
      });
      candList.appendChild(btn);
    });
    const sel = candList.querySelector('.selected');
    if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  } else {
    candRow.style.display = 'none';
    updateAIBadge(false);
    const debugInfo = $('debug-info');
    if (debugInfo) debugInfo.textContent = '';
  }
}

// ── Textarea editing helpers ──────────────────────────────────────

function syncSnapshot() {
  const el = ta();
  lastValue = el.value;
  lastSelStart = el.selectionStart;
}

function insertAtCursor(text) {
  if (!text) return;
  const el = ta();
  const s = el.selectionStart;
  const e = el.selectionEnd;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  const pos = s + text.length;
  el.setSelectionRange(pos, pos);
  syncSnapshot();
  saveTextToStorage();
}

function deleteBeforeCaret() {
  const el = ta();
  const s = el.selectionStart;
  const e = el.selectionEnd;
  if (s !== e) {
    el.value = el.value.slice(0, s) + el.value.slice(e);
    el.setSelectionRange(s, s);
  } else if (s > 0) {
    const before = el.value.slice(0, s);
    const arr = [...before];
    arr.pop();
    const newBefore = arr.join('');
    el.value = newBefore + el.value.slice(s);
    el.setSelectionRange(newBefore.length, newBefore.length);
  }
  syncSnapshot();
  saveTextToStorage();
}

// ── Event handling ────────────────────────────────────────────────

function setupEvents() {
  const el = ta();

  $('input-area').addEventListener('pointerdown', e => { e.preventDefault(); focusInput(); });

  el.addEventListener('keydown', handleKeyDown);
  el.addEventListener('input', handleInput);
  el.addEventListener('keyup', syncSnapshot);
  el.addEventListener('click', syncSnapshot);

  $('btn-save').addEventListener('click', () => { saveTextToStorage(); showToast('保存しました'); });
  $('btn-load').addEventListener('click', () => { if (loadTextFromStorage() !== null) showToast('読み込みました'); });
  $('btn-download').addEventListener('click', downloadText);
  $('btn-dict-load').addEventListener('click', () => $('dict-file-input').click());
  $('dict-file-input').addEventListener('change', handleDictFileLoad);
  $('btn-dict-refresh').addEventListener('click', async () => {
    $('dict-status').textContent = '再ダウンロード中…';
    await dict.clearCache();
    await initDictionary();
  });
  $('btn-clear').addEventListener('click', () => {
    if (confirm('テキストをすべて消去しますか？')) {
      ta().value = '';
      engine.cancelConversion();
      syncSnapshot();
      saveTextToStorage();
      render();
    }
  });
  $('btn-mode').addEventListener('pointerdown', e => {
    e.preventDefault();
    cycleModeFromButton();
    focusInput();
  });
  $('capslock-indicator').addEventListener('pointerdown', e => {
    e.preventDefault();
    capsLockComp = !capsLockComp;
    saveCapsLockComp();
    updateCapsLockUI();
    focusInput();
  });
}

function focusInput() {
  ta().focus({ preventScroll: true });
}

function cycleModeFromButton() {
  const m = engine.mode;
  if (m === 'ascii') engine.processKey('j', false, true);
  else if (m === 'hiragana') engine.processKey('q', false, false);
  else engine.processKey('l', false, false);
  render();
}

function handleKeyDown(e) {
  capsLockOn = e.getModifierState('CapsLock');
  updateCapsLockUI();

  let key = e.key;
  const shift = e.shiftKey;
  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;

  if (capsLockComp && capsLockOn && engine.mode !== 'ascii') {
    if (key.length === 1 && /[a-zA-Z]/.test(key)) key = key.toLowerCase();
  }

  if (ctrl && key === 'j') {
    e.preventDefault();
    runEngine('j', shift, true, false);
    return;
  }
  if (ctrl && key === 'g') {
    e.preventDefault();
    runEngine('g', shift, true, false);
    return;
  }
  if (ctrl || alt) return;

  const mode = engine.mode;

  if (mode === 'ascii') return;

  if (mode === 'hiragana' || mode === 'katakana') {
    const composing = engine.pendingRoman.length > 0;

    if (key === 'Backspace' || key === 'Delete' ||
        key === 'ArrowLeft' || key === 'ArrowRight' ||
        key === 'ArrowUp' || key === 'ArrowDown' ||
        key === 'Home' || key === 'End' || key === 'Enter') {
      if (composing && (key === 'Backspace' || key === 'Enter')) {
        e.preventDefault();
        runEngine(key, shift, false, false);
      }
      return;
    }
    if (key === ' ' || key.length === 1) {
      e.preventDefault();
      runEngine(key, shift, false, false);
      return;
    }
    return;
  }

  if (mode === 'preediting' || mode === 'converting') {
    const special = ['Enter', 'Backspace', 'Escape', ' ',
                     'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (key.length === 1 || special.includes(key)) {
      e.preventDefault();
      runEngine(key, shift, false, false);
      return;
    }
    return;
  }
}

function handleInput(e) {
  const mode = engine.mode;
  const el = ta();

  const nativeInsert = e.inputType === 'insertText' ||
                       e.inputType === 'insertCompositionText' ||
                       e.inputType === 'insertFromComposition';

  const mustCapture = mode !== 'ascii' && nativeInsert && e.data;

  if (mustCapture) {
    el.value = lastValue;
    el.setSelectionRange(lastSelStart, lastSelStart);
    for (const ch of e.data) {
      const isLetter = /[a-zA-Z]/.test(ch);
      const shift = isLetter && ch === ch.toUpperCase() &&
                    !(capsLockComp && capsLockOn);
      const key = isLetter ? ch.toLowerCase() : ch;
      runEngine(key, shift, false, false);
    }
    return;
  }

  syncSnapshot();
  saveTextToStorage();
}

function runEngine(key, shift, ctrl, alt) {
  const result = engine.processKey(key, shift, ctrl, alt);
  if (result.backspace) deleteBeforeCaret();
  else if (result.commit) {
    insertAtCursor(result.commit);
    // Reset rerank state after committing
    lastRerankKey = '';
    updateAIBadge(false);
  } else {
    render();
  }

  // Trigger AI rerank asynchronously after converting mode is active
  if (engine.mode === 'converting') {
    maybeRerankCandidates();
  }
}

// ── Storage ───────────────────────────────────────────────────────

function saveTextToStorage() {
  try {
    localStorage.setItem('skkEditor_confirmedText', ta().value);
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

function loadTextFromStorage() {
  try {
    const saved = localStorage.getItem('skkEditor_confirmedText');
    if (saved !== null) {
      ta().value = saved;
      syncSnapshot();
      return saved;
    }
  } catch (e) {}
  return null;
}

// ── File operations ───────────────────────────────────────────────

function downloadText() {
  const blob = new Blob([ta().value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
  a.download = `text_${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleDictFileLoad(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  $('dict-status').textContent = `辞書ファイル読み込み中: ${file.name}`;
  const buf = await file.arrayBuffer();

  let entries;
  try {
    entries = parseSKKJisyo(buf);
  } catch {
    const text = new TextDecoder('utf-8').decode(buf);
    entries = parseSKKJisyoUTF8(text);
  }

  if (Object.keys(entries).length === 0) {
    showToast('辞書のパースに失敗しました');
    return;
  }

  dict.mergeEntries(entries);
  const n = Object.keys(entries).length;
  $('dict-status').textContent = `辞書: ${file.name} 追加済み (+${n.toLocaleString()} 語)`;
  showToast(`辞書を追加しました (${n.toLocaleString()} 語)`);
}

// ── Bottom offset (drag handle) ───────────────────────────────────

let _bottomOffset = 0;

function applyBottomOffset(px) {
  _bottomOffset = Math.max(0, Math.min(600, px));
  document.documentElement.style.setProperty('--bottom-offset', _bottomOffset + 'px');
}

function loadBottomOffset() {
  const saved = localStorage.getItem('skkEditor_bottomOffset');
  applyBottomOffset(saved ? parseInt(saved, 10) : 0);
}

function saveBottomOffset() {
  localStorage.setItem('skkEditor_bottomOffset', _bottomOffset);
}

function setupBottomHandle() {
  const handle = $('bottom-handle');
  let dragging = false;
  let startY = 0;
  let startOffset = 0;

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startOffset = _bottomOffset;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    applyBottomOffset(startOffset + delta);
  });

  handle.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    const delta = startY - e.clientY;
    applyBottomOffset(startOffset + delta);
    saveBottomOffset();
  });

  handle.addEventListener('pointercancel', () => { dragging = false; });
}

// ── Toast notification ────────────────────────────────────────────

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

document.addEventListener('DOMContentLoaded', init);
