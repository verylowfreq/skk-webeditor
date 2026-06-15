// Main application logic
//
// The confirmed text lives in a real <textarea> (#confirmed-text), which is also
// the keyboard-capture element. This gives us native caret movement, selection,
// tap-to-position and scrolling for free. SKK composition happens "above" the
// textarea: while composing we intercept keystrokes and feed them to the engine;
// committed text is inserted at the caret. When not composing, the textarea
// behaves like a normal editor (typing in ASCII mode, backspace, arrows, etc.).

let engine = null;
let dict = null;

const $ = id => document.getElementById(id);
const ta = () => $('confirmed-text');

// Snapshot of the textarea used to detect/revert native edits that slipped
// through on mobile Bluetooth keyboards (where keydown.key is "Unidentified").
let lastValue = '';
let lastSelStart = 0;

function init() {
  dict = new Dictionary();
  engine = new SKKEngine(dict);
  engine.onChange = render;

  loadTextFromStorage();
  syncSnapshot();
  render();
  setupEvents();
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
      else progressBar.removeAttribute('value'); // indeterminate
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

// render() only updates the SKK composition UI (bottom line + candidates).
// The textarea is the source of truth for confirmed text and is never rewritten
// here, so the native caret/selection is preserved.
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
      btn.textContent = (i + 1 <= 9 ? `${i + 1}.` : '') + c;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        const result = engine.selectCandidate(i);
        if (result.commit) insertAtCursor(result.commit);
        focusInput();
      });
      candList.appendChild(btn);
    });
    const sel = candList.querySelector('.selected');
    if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  } else {
    candRow.style.display = 'none';
  }
}

// ── Textarea editing helpers ──────────────────────────────────────

function syncSnapshot() {
  const el = ta();
  lastValue = el.value;
  lastSelStart = el.selectionStart;
}

// Insert committed SKK text at the current caret (replacing any selection),
// then place the caret after it.
function insertAtCursor(text) {
  if (!text) return;
  const el = ta();
  const s = el.selectionStart;
  const e = el.selectionEnd;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  const pos = s + text.length;
  el.setSelectionRange(pos, pos); // also scrolls the caret into view when focused
  syncSnapshot();
  saveTextToStorage();
}

// Delete one code point before the caret (used by engine backspace fallback).
function deleteBeforeCaret() {
  const el = ta();
  const s = el.selectionStart;
  const e = el.selectionEnd;
  if (s !== e) {
    // Delete the selection
    el.value = el.value.slice(0, s) + el.value.slice(e);
    el.setSelectionRange(s, s);
  } else if (s > 0) {
    // Step back one code point (handles surrogate pairs)
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

  // Tapping the input line focuses the editor (so the keyboard stays up).
  $('input-area').addEventListener('pointerdown', e => { e.preventDefault(); focusInput(); });

  el.addEventListener('keydown', handleKeyDown);
  el.addEventListener('input', handleInput);
  // Keep snapshot fresh after native caret moves (click / arrows / selection).
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
  // Buttons use pointerdown + preventDefault so they don't steal focus from
  // the editor, then we refocus it afterwards to keep the keyboard up.
  $('btn-mode').addEventListener('pointerdown', e => {
    e.preventDefault();
    cycleModeFromButton();
    focusInput();
  });
}

function focusInput() {
  ta().focus({ preventScroll: true });
}

function cycleModeFromButton() {
  const m = engine.mode;
  if (m === 'ascii') engine.processKey('j', false, true);      // → hiragana
  else if (m === 'hiragana') engine.processKey('q', false, false); // → katakana
  else engine.processKey('l', false, false);                   // → ASCII
  render();
}

function handleKeyDown(e) {
  const key = e.key;
  const shift = e.shiftKey;
  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;

  // Ctrl+J: enter hiragana mode from anywhere.
  if (ctrl && key === 'j') {
    e.preventDefault();
    runEngine('j', shift, true, false);
    return;
  }
  // Ctrl+G: cancel composition.
  if (ctrl && key === 'g') {
    e.preventDefault();
    runEngine('g', shift, true, false);
    return;
  }
  // Let all other Ctrl/Cmd/Alt combos work natively (copy, paste, select-all, undo…).
  if (ctrl || alt) return;

  const mode = engine.mode;

  // ASCII mode: fully native textarea editing (typing, backspace, arrows…).
  if (mode === 'ascii') return;

  if (mode === 'hiragana' || mode === 'katakana') {
    const composing = engine.pendingRoman.length > 0;

    // Navigation / deletion: native unless we're mid-romaji.
    if (key === 'Backspace' || key === 'Delete' ||
        key === 'ArrowLeft' || key === 'ArrowRight' ||
        key === 'ArrowUp' || key === 'ArrowDown' ||
        key === 'Home' || key === 'End' || key === 'Enter') {
      if (composing && (key === 'Backspace' || key === 'Enter')) {
        e.preventDefault();
        runEngine(key, shift, false, false);
      }
      // otherwise native (move caret / newline / delete confirmed text)
      return;
    }
    if (key === ' ' || key.length === 1) {
      e.preventDefault();
      runEngine(key, shift, false, false);
      return;
    }
    // key === 'Unidentified' (mobile BT): fall through to the input handler.
    return;
  }

  // Preediting (▽) / converting (▼): the engine owns every relevant key.
  if (mode === 'preediting' || mode === 'converting') {
    const special = ['Enter', 'Backspace', 'Escape', ' ',
                     'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (key.length === 1 || special.includes(key)) {
      e.preventDefault();
      runEngine(key, shift, false, false);
      return;
    }
    // Unidentified → input handler
    return;
  }
}

// Fallback for mobile Bluetooth keyboards: keydown reported "Unidentified",
// so the character was inserted natively. If we should have captured it, revert
// the textarea and feed the character(s) to the engine instead.
function handleInput(e) {
  const mode = engine.mode;
  const el = ta();

  const nativeInsert = e.inputType === 'insertText' ||
                       e.inputType === 'insertCompositionText' ||
                       e.inputType === 'insertFromComposition';

  // In a mode where the engine must own typed characters, reclaim them.
  const mustCapture = mode !== 'ascii' && nativeInsert && e.data;

  if (mustCapture) {
    // Restore pre-input state, then process the inserted characters.
    el.value = lastValue;
    el.setSelectionRange(lastSelStart, lastSelStart);
    for (const ch of e.data) {
      const isLetter = /[a-zA-Z]/.test(ch);
      const shift = isLetter && ch === ch.toUpperCase();
      const key = isLetter ? ch.toLowerCase() : ch;
      runEngine(key, shift, false, false);
    }
    return;
  }

  // Otherwise this is a legitimate native edit (ASCII typing, native backspace,
  // newline, paste…). Accept it and persist.
  syncSnapshot();
  saveTextToStorage();
}

function runEngine(key, shift, ctrl, alt) {
  const result = engine.processKey(key, shift, ctrl, alt);
  if (result.backspace) deleteBeforeCaret();
  else if (result.commit) insertAtCursor(result.commit);
  else render();
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

// ── Toast notification ────────────────────────────────────────────

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

document.addEventListener('DOMContentLoaded', init);
