// Main application logic

let confirmedText = '';
let engine = null;
let dict = null;

const $ = id => document.getElementById(id);

function init() {
  dict = new Dictionary();
  engine = new SKKEngine(dict);
  engine.onChange = render;

  loadTextFromStorage();
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
      if (pct >= 0) {
        progressBar.value = Math.round(pct * 100);
      } else {
        progressBar.removeAttribute('value'); // indeterminate
      }
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

function render() {
  // Update confirmed text display
  const textArea = $('confirmed-text');
  textArea.textContent = confirmedText;
  // Scroll to bottom
  textArea.scrollTop = textArea.scrollHeight;

  // Update composition / input line
  const comp = engine.compositionText;
  $('composition-text').textContent = comp || '';

  // Update mode label
  $('mode-label').textContent = engine.modeLabel;

  // Update candidates
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
        if (result.commit) {
          appendConfirmed(result.commit);
        }
        focusInput();
      });
      candList.appendChild(btn);
    });
    // Scroll selected into view
    const sel = candList.querySelector('.selected');
    if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  } else {
    candRow.style.display = 'none';
  }
}

function appendConfirmed(text) {
  if (!text) return;
  confirmedText += text;
  saveTextToStorage();
  render();
}

function deleteConfirmedChar() {
  if (confirmedText.length > 0) {
    // Handle surrogate pairs / multi-char properly
    const arr = [...confirmedText];
    arr.pop();
    confirmedText = arr.join('');
    saveTextToStorage();
    render();
  }
}

// ── Event handling ────────────────────────────────────────────────

function setupEvents() {
  const hiddenInput = $('hidden-input');

  // Focus capture: tap on input line or anywhere below text area
  $('input-area').addEventListener('pointerdown', e => {
    e.preventDefault();
    focusInput();
  });

  $('confirmed-text').addEventListener('pointerdown', e => {
    focusInput();
  });

  hiddenInput.addEventListener('keydown', handleKeyDown);
  hiddenInput.addEventListener('beforeinput', handleBeforeInput);

  // Buttons
  $('btn-save').addEventListener('click', () => {
    saveTextToStorage();
    showToast('保存しました');
  });

  $('btn-load').addEventListener('click', () => {
    const loaded = loadTextFromStorage();
    if (loaded !== null) showToast('読み込みました');
  });

  $('btn-download').addEventListener('click', downloadText);

  $('btn-dict-load').addEventListener('click', () => {
    $('dict-file-input').click();
  });

  $('dict-file-input').addEventListener('change', handleDictFileLoad);

  $('btn-dict-refresh').addEventListener('click', async () => {
    $('dict-status').textContent = '再ダウンロード中…';
    await dict.clearCache();
    await initDictionary();
  });

  $('btn-clear').addEventListener('click', () => {
    if (confirm('テキストをすべて消去しますか？')) {
      confirmedText = '';
      saveTextToStorage();
      render();
    }
  });

  $('btn-mode').addEventListener('pointerdown', e => {
    e.preventDefault();
    cycleModeFromButton();
    focusInput();
  });
}

function focusInput() {
  const hi = $('hidden-input');
  hi.focus({ preventScroll: true });
}

function cycleModeFromButton() {
  // Cycle ASCII → hiragana → katakana → ASCII via synthetic key
  const m = engine.mode;
  if (m === 'ascii') {
    engine.processKey('j', false, true); // Ctrl+j → hiragana
  } else if (m === 'hiragana') {
    engine.processKey('q', false, false); // q → katakana
  } else {
    engine.processKey('l', false, false); // l → ASCII
  }
  render();
}

function handleKeyDown(e) {
  const key = e.key;
  const shift = e.shiftKey;
  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;

  // Keys we handle
  const handled = [
    'Enter', 'Backspace', 'Escape', ' ',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ];

  // Handle Ctrl+J
  if (ctrl && key === 'j') {
    e.preventDefault();
    const result = engine.processKey('j', shift, true);
    if (result.commit) appendConfirmed(result.commit);
    return;
  }

  if (ctrl && key === 'g') {
    e.preventDefault();
    engine.processKey('g', shift, true);
    render();
    return;
  }

  if (handled.includes(key) || (key.length === 1)) {
    e.preventDefault();
    processEngineKey(key, shift, ctrl, alt);
  }
}

function handleBeforeInput(e) {
  // Prevent any text from actually being inserted into the hidden input
  e.preventDefault();
}

function processEngineKey(key, shift, ctrl, alt) {
  const actualKey = key === ' ' ? ' ' : key;
  const result = engine.processKey(actualKey, shift, ctrl, alt);

  if (result.backspace) {
    deleteConfirmedChar();
  } else if (result.commit) {
    appendConfirmed(result.commit);
  } else {
    render();
  }
}

// ── Storage ───────────────────────────────────────────────────────

function saveTextToStorage() {
  try {
    localStorage.setItem('skkEditor_confirmedText', confirmedText);
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

function loadTextFromStorage() {
  try {
    const saved = localStorage.getItem('skkEditor_confirmedText');
    if (saved !== null) {
      confirmedText = saved;
      render();
      return saved;
    }
  } catch (e) {}
  return null;
}

// ── File operations ───────────────────────────────────────────────

function downloadText() {
  const blob = new Blob([confirmedText], { type: 'text/plain;charset=utf-8' });
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
  // Try EUC-JP first, then UTF-8
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
  $('dict-status').textContent = `辞書: ${file.name} 追加済み (+${Object.keys(entries).toLocaleString()} 語)`;
  showToast(`辞書を追加しました (${Object.keys(entries).length.toLocaleString()} 語)`);
}

// ── Toast notification ────────────────────────────────────────────

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

document.addEventListener('DOMContentLoaded', init);
