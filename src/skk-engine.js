// SKK input engine — state machine

import { RomanKanaConverter, hiraToKata } from './roman-kana.js';

export const MODE = {
  ASCII:      'ascii',
  HIRAGANA:   'hiragana',
  KATAKANA:   'katakana',
  PREEDITING: 'preediting',
  CONVERTING: 'converting',
};

const KANA_PUNCT = {
  '.': '。', ',': '、', '/': '・', '[': '「', ']': '」',
  '!': '！', '?': '？', '~': '〜',
};

export class SKKEngine {
  constructor(dictionary) {
    this._dict = dictionary;
    this._mode = MODE.ASCII;
    this._prevKanaMode = MODE.HIRAGANA;
    this._conv = new RomanKanaConverter();
    this._reading = '';
    this._okuriRoman = '';
    this._okuriKana = '';
    this._candidates = [];
    this._candidateIdx = 0;
    this._onChange = null;
  }

  set onChange(fn) { this._onChange = fn; }

  get mode() { return this._mode; }
  get candidates() { return this._candidates; }
  get candidateIdx() { return this._candidateIdx; }
  get okuriKana() { return this._okuriKana; }
  get reading() { return this._reading; }

  get pendingRoman() { return this._conv.pending; }

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

  // Replace the candidate list externally (e.g. AI reranker result).
  // Only applies when in converting mode. Returns true on success.
  setCandidates(candidates, reason = 'external') {
    if (this._mode !== MODE.CONVERTING) return false;
    if (!Array.isArray(candidates) || candidates.length === 0) return false;

    this._candidates = candidates;
    this._candidateIdx = 0;
    this._notify();
    return true;
  }

  _notify() {
    if (this._onChange) this._onChange();
  }

  _handleAscii(key, shift, ctrl) {
    if (key === 'Enter') {
      return { commit: '\n' };
    }
    if (key === 'Backspace') {
      return { commit: null, backspace: true };
    }
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
        return { commit: null, backspace: true };
      }
      this._notify();
      return { commit: null };
    }

    if (shift && key.length === 1 && /[a-zA-Z]/.test(key)) {
      const { kana } = this._conv.flush();
      const flushCommit = kana ? this._applyKana(kana) : null;
      this._mode = MODE.PREEDITING;
      this._reading = '';
      this._okuriRoman = '';
      this._okuriKana = '';
      const result = this._conv.feed(key.toLowerCase());
      if (result.kana) {
        this._reading += result.kana;
      }
      this._notify();
      return { commit: flushCommit };
    }

    if (key === ' ') {
      const pending = this._conv.flush();
      const kanaCommit = pending.kana ? this._applyKana(pending.kana) : '';
      this._notify();
      return { commit: (kanaCommit || '') + '　' };
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

  _handlePreediting(key, shift, ctrl) {
    if (key === 'Escape') return this._cancel();

    if (key === 'Enter') {
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
      return this._cancel();
    }

    if (key === ' ') {
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
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      const text = this._isKatakana ? this._reading : hiraToKata(this._reading);
      this._resetToKana();
      this._notify();
      return { commit: text };
    }

    if (key === 'l' && !shift) {
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      const text = this._isKatakana ? hiraToKata(this._reading) : this._reading;
      this._mode = MODE.ASCII;
      this._reading = '';
      this._notify();
      return { commit: text };
    }

    if (shift && key.length === 1 && /[a-zA-Z]/.test(key)) {
      const { kana } = this._conv.flush();
      if (kana) this._reading += kana;
      this._okuriRoman = key.toLowerCase();
      const result = this._conv.feed(key.toLowerCase());
      if (result.kana) {
        this._okuriKana = result.kana;
        return this._startConversion();
      }
      this._notify();
      return { commit: null };
    }

    if (key.length === 1) {
      if (this._okuriRoman) {
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
    let lookupKey = this._reading;
    if (this._okuriKana) {
      lookupKey = this._reading + this._okuriRoman[0];
    }

    this._candidates = this._dict.lookup(lookupKey);

    if (this._candidates.length === 0) {
      this._candidates = [this._isKatakana ? hiraToKata(this._reading) : this._reading];
    }

    this._mode = MODE.CONVERTING;
    this._candidateIdx = 0;
    this._notify();
    return { commit: null };
  }

  _handleConverting(key, shift, ctrl) {
    if (key === 'Escape' || (ctrl && key === 'g')) {
      return this._cancel();
    }

    if (key === 'Backspace') {
      this._mode = MODE.PREEDITING;
      this._candidates = [];
      this._candidateIdx = 0;
      this._okuriRoman = '';
      this._okuriKana = '';
      this._conv.reset();
      if (this._reading.length > 0) {
        this._reading = this._reading.slice(0, -1);
      }
      if (this._reading.length === 0) {
        this._resetToKana();
      }
      this._notify();
      return { commit: null };
    }

    if (key === ' ' || key === 'ArrowDown') {
      this._candidateIdx = (this._candidateIdx + 1) % this._candidates.length;
      this._notify();
      return { commit: null };
    }

    if (key === 'x' || key === 'ArrowUp') {
      if (this._candidateIdx === 0) {
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

    const num = parseInt(key, 10);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      const idx = num - 1;
      if (idx < this._candidates.length) {
        this._candidateIdx = idx;
        return this._commitCandidate();
      }
    }

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

  selectCandidate(idx) {
    if (this._mode !== MODE.CONVERTING) return { commit: null };
    this._candidateIdx = idx;
    return this._commitCandidate();
  }

  cancelConversion() {
    return this._cancel();
  }
}
