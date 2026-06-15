// SKK input engine — state machine

const MODE = {
  ASCII:      'ascii',
  HIRAGANA:   'hiragana',
  KATAKANA:   'katakana',
  PREEDITING: 'preediting', // ▽mode
  CONVERTING: 'converting', // ▼mode
};

// Punctuation converted to full-width Japanese equivalents while in kana mode.
const KANA_PUNCT = {
  '.': '。', ',': '、', '/': '・', '[': '「', ']': '」',
  '!': '！', '?': '？', '~': '〜',
};

class SKKEngine {
  constructor(dictionary) {
    this._dict = dictionary;
    this._mode = MODE.ASCII;
    this._prevKanaMode = MODE.HIRAGANA; // remembered when entering ▽/▼
    this._conv = new RomanKanaConverter();
    this._reading = '';       // accumulated kana reading (▽mode)
    this._okuriRoman = '';    // roman chars for okurigana
    this._okuriKana = '';     // resolved okurigana kana
    this._candidates = [];
    this._candidateIdx = 0;
    this._onChange = null;
  }

  set onChange(fn) { this._onChange = fn; }

  get mode() { return this._mode; }
  get candidates() { return this._candidates; }
  get candidateIdx() { return this._candidateIdx; }

  // Roman-kana buffer still waiting for more input (e.g. "k" before a vowel)
  get pendingRoman() { return this._conv.pending; }

  // True when the engine owns the keystrokes (preedit/convert, or mid-romaji in kana mode)
  get isComposing() {
    return this._mode === MODE.PREEDITING ||
           this._mode === MODE.CONVERTING ||
           this._conv.pending.length > 0;
  }

  get modeLabel() {
    switch (this._mode) {
      case MODE.ASCII:      return 'A';
      case MODE.HIRAGANA:   return 'あ';
      case MODE.KATAKANA:   return 'ア';
      case MODE.PREEDITING: return '▽';
      case MODE.CONVERTING: return '▼';
    }
  }

  // Returns the text to display in the input line
  get compositionText() {
    switch (this._mode) {
      case MODE.ASCII:
        return this._conv.pending;
      case MODE.HIRAGANA:
      case MODE.KATAKANA:
        return this._conv.pending;
      case MODE.PREEDITING: {
        const pending = this._conv.pending;
        const reading = this._isKatakana ? hiraToKata(this._reading) : this._reading;
        return '▽' + reading + (this._okuriKana ? '*' + this._okuriKana : '') + pending;
      }
      case MODE.CONVERTING: {
        const cand = this._candidates[this._candidateIdx] || '';
        return '▼' + cand + this._okuriKana;
      }
    }
    return '';
  }

  get _isKatakana() {
    return this._prevKanaMode === MODE.KATAKANA;
  }

  // Main key processing. Returns {commit: string|null} — text to append to confirmed area.
  processKey(key, shift, ctrl, alt) {
    if (ctrl && key === 'j') {
      return this._switchToHiragana();
    }
    if (ctrl && key === 'g') {
      return this._cancel();
    }

    switch (this._mode) {
      case MODE.ASCII:      return this._handleAscii(key, shift, ctrl);
      case MODE.HIRAGANA:
      case MODE.KATAKANA:   return this._handleKana(key, shift, ctrl);
      case MODE.PREEDITING: return this._handlePreediting(key, shift, ctrl);
      case MODE.CONVERTING: return this._handleConverting(key, shift, ctrl);
    }
    return { commit: null };
  }

  _notify() {
    if (this._onChange) this._onChange();
  }

  // ── ASCII mode ───────────────────────────────────────────────────
  _handleAscii(key, shift, ctrl) {
    if (key === 'Enter') {
      return { commit: '\n' };
    }
    if (key === 'Backspace') {
      return { commit: null, backspace: true };
    }
    // Output character as-is
    const ch = shift ? key.toUpperCase() : key;
    if (ch.length === 1) {
      this._notify();
      return { commit: ch };
    }
    return { commit: null };
  }

  _switchToHiragana() {
    this._mode = MODE.HIRAGANA;
    this._prevKanaMode = MODE.HIRAGANA;
    this._conv.reset();
    this._notify();
    return { commit: null };
  }

  // ── Kana mode (hiragana/katakana) ────────────────────────────────
  _handleKana(key, shift, ctrl) {
    if (key === 'Escape') return this._cancel();

    if (key === 'l' && !shift) {
      this._mode = MODE.ASCII;
      this._conv.reset();
      this._notify();
      return { commit: null };
    }

    if (key === 'q' && !shift) {
      this._mode = this._mode === MODE.HIRAGANA ? MODE.KATAKANA : MODE.HIRAGANA;
      this._prevKanaMode = this._mode;
      this._conv.reset();
      this._notify();
      return { commit: null };
    }

    if (key === 'Enter') {
      const pending = this._conv.pending;
      this._conv.reset();
      this._notify();
      return { commit: pending.length > 0 ? pending : null };
    }

    if (key === 'Backspace') {
      if (!this._conv.backspace()) {
        // nothing in roman buffer — delete from confirmed text
        return { commit: null, backspace: true };
      }
      this._notify();
      return { commit: null };
    }

    // Shift + letter → start ▽mode
    if (shift && key.length === 1 && /[a-zA-Z]/.test(key)) {
      // Flush pending roman
      const { kana } = this._conv.flush();
      const flushCommit = kana ? this._applyKana(kana) : null;
      this._mode = MODE.PREEDITING;
      this._reading = '';
      this._okuriRoman = '';
      this._okuriKana = '';
      // Feed the shifted letter as first roman char of reading
      const result = this._conv.feed(key.toLowerCase());
      if (result.kana) {
        this._reading += result.kana;
      }
      this._notify();
      return { commit: flushCommit };
    }

    if (key === ' ') {
      // Space in kana mode → output space
      const pending = this._conv.flush();
      const kanaCommit = pending.kana ? this._applyKana(pending.kana) : '';
      this._notify();
      return { commit: (kanaCommit || '') + '　' }; // full-width space
    }

    if (key.length === 1) {
      return this._feedRoman(key);
    }

    return { commit: null };
  }

  _feedRoman(ch) {
    const result = this._conv.feed(ch);
    let commit = '';
    if (result.kana) commit += this._applyKana(result.kana);
    // Single character with no roman-kana mapping (e.g. punctuation, digits):
    // emit it directly instead of silently dropping it.
    if (result.unmatched) commit += KANA_PUNCT[result.unmatched] || result.unmatched;
    this._notify();
    return { commit: commit || null };
  }

  _applyKana(kana) {
    if (this._mode === MODE.KATAKANA || this._prevKanaMode === MODE.KATAKANA) {
      return hiraToKata(kana);
    }
    return kana;
  }

  // ── ▽ preediting mode ────────────────────────────────────────────
  _handlePreediting(key, shift, ctrl) {
    if (key === 'Escape') return this._cancel();

    if (key === 'Enter') {
      // Commit reading as-is
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      const text = this._isKatakana ? hiraToKata(this._reading) : this._reading;
      this._resetToKana();
      this._notify();
      return { commit: text };
    }

    if (key === 'Backspace') {
      if (this._conv.backspace()) {
        this._notify();
        return { commit: null };
      }
      if (this._reading.length > 0) {
        this._reading = this._reading.slice(0, -1);
        this._notify();
        return { commit: null };
      }
      // Reading empty → cancel back to kana mode
      return this._cancel();
    }

    if (key === ' ') {
      // Flush pending roman into reading
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      if (this._reading.length === 0) {
        this._resetToKana();
        this._notify();
        return { commit: null };
      }
      return this._startConversion();
    }

    if (key === 'q' && !shift) {
      // Toggle katakana/hiragana for this reading
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      const text = this._isKatakana ? this._reading : hiraToKata(this._reading);
      this._resetToKana();
      this._notify();
      return { commit: text };
    }

    if (key === 'l' && !shift) {
      // Commit reading as-is and switch to ASCII
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      const text = this._isKatakana ? hiraToKata(this._reading) : this._reading;
      this._mode = MODE.ASCII;
      this._reading = '';
      this._notify();
      return { commit: text };
    }

    if (shift && key.length === 1 && /[a-zA-Z]/.test(key)) {
      // Uppercase in ▽mode → marks start of okurigana
      // First flush current roman buffer into reading
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      // Start feeding okurigana
      this._okuriRoman = key.toLowerCase();
      const result = this._conv.feed(key.toLowerCase());
      if (result.kana) {
        this._okuriKana = result.kana;
        // Trigger conversion immediately with okurigana
        return this._startConversion();
      }
      this._notify();
      return { commit: null };
    }

    if (key.length === 1) {
      if (this._okuriRoman) {
        // Feeding additional chars for okurigana resolution
        const result = this._conv.feed(key);
        if (result.kana) {
          this._okuriKana = result.kana;
          return this._startConversion();
        }
        this._notify();
        return { commit: null };
      }
      const result = this._conv.feed(key);
      if (result.kana) {
        this._reading += result.kana;
      }
      this._notify();
      return { commit: null };
    }

    return { commit: null };
  }

  _startConversion() {
    // Build dictionary lookup key.
    // Okuri-ari entries in SKK-JISYO are keyed by the reading plus the *romaji*
    // consonant of the okurigana (e.g. おくる → key "おくr", candidate "送").
    // The okurigana kana itself is appended separately at commit time, so the
    // lookup must NOT include it — otherwise we'd hit an okuri-nashi entry whose
    // candidate already contains the okurigana and end up doubling it.
    let lookupKey = this._reading;
    if (this._okuriKana) {
      lookupKey = this._reading + this._okuriRoman[0];
    }

    this._candidates = this._dict.lookup(lookupKey);

    if (this._candidates.length === 0) {
      // No dictionary hit: fall back to the bare reading so the user can still
      // commit the kana (kanji conversion simply isn't available).
      this._candidates = [this._isKatakana ? hiraToKata(this._reading) : this._reading];
    }

    this._mode = MODE.CONVERTING;
    this._candidateIdx = 0;
    this._notify();
    return { commit: null };
  }

  // ── ▼ converting mode ────────────────────────────────────────────
  _handleConverting(key, shift, ctrl) {
    if (key === 'Escape' || (ctrl && key === 'g')) {
      return this._cancel();
    }

    if (key === ' ' || key === 'ArrowDown') {
      // Next candidate
      this._candidateIdx = (this._candidateIdx + 1) % this._candidates.length;
      this._notify();
      return { commit: null };
    }

    if (key === 'x' || key === 'ArrowUp') {
      // Previous candidate
      if (this._candidateIdx === 0) {
        // Back to preediting
        this._mode = MODE.PREEDITING;
        this._candidateIdx = 0;
        this._candidates = [];
        this._notify();
        return { commit: null };
      }
      this._candidateIdx = Math.max(0, this._candidateIdx - 1);
      this._notify();
      return { commit: null };
    }

    if (key === 'Enter') {
      return this._commitCandidate();
    }

    // Number key or letter → quick select (if we show a numbered list)
    const num = parseInt(key, 10);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      const idx = num - 1;
      if (idx < this._candidates.length) {
        this._candidateIdx = idx;
        return this._commitCandidate();
      }
    }

    // Any other printable character → commit current candidate then process in kana mode
    if (key.length === 1) {
      const result = this._commitCandidate();
      this._mode = this._prevKanaMode;
      const nextResult = this._handleKana(key, shift, ctrl);
      return { commit: (result.commit || '') + (nextResult.commit || '') || null };
    }

    return { commit: null };
  }

  _commitCandidate() {
    const cand = this._candidates[this._candidateIdx] || '';
    const text = cand + this._okuriKana;
    this._resetToKana();
    this._notify();
    return { commit: text };
  }

  _cancel() {
    if (this._mode === MODE.CONVERTING) {
      this._mode = MODE.PREEDITING;
      this._candidates = [];
      this._candidateIdx = 0;
    } else if (this._mode === MODE.PREEDITING) {
      this._resetToKana();
    } else {
      this._mode = MODE.ASCII;
    }
    this._conv.reset();
    this._notify();
    return { commit: null };
  }

  _resetToKana() {
    this._mode = this._prevKanaMode;
    this._reading = '';
    this._okuriRoman = '';
    this._okuriKana = '';
    this._candidates = [];
    this._candidateIdx = 0;
    this._conv.reset();
  }

  // Direct candidate selection (from UI click)
  selectCandidate(idx) {
    if (this._mode !== MODE.CONVERTING) return { commit: null };
    this._candidateIdx = idx;
    return this._commitCandidate();
  }

  cancelConversion() {
    return this._cancel();
  }
}
