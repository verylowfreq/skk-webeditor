// Roman-to-kana conversion table and logic

const ROMAN_KANA_TABLE = {
  'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',
  'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
  'sa': 'さ', 'si': 'し', 'su': 'す', 'se': 'せ', 'so': 'そ',
  'shi': 'し', 'sha': 'しゃ', 'shu': 'しゅ', 'she': 'しぇ', 'sho': 'しょ',
  'ta': 'た', 'ti': 'ち', 'tu': 'つ', 'te': 'て', 'to': 'と',
  'chi': 'ち', 'tsu': 'つ',
  'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
  'ha': 'は', 'hi': 'ひ', 'hu': 'ふ', 'he': 'へ', 'ho': 'ほ',
  'fu': 'ふ',
  'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
  'ya': 'や', 'yu': 'ゆ', 'yo': 'よ',
  'ra': 'ら', 'ri': 'り', 'ru': 'る', 're': 'れ', 'ro': 'ろ',
  'wa': 'わ', 'wi': 'ゐ', 'we': 'ゑ', 'wo': 'を',
  'nn': 'ん', 'xn': 'ん',
  'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
  'za': 'ざ', 'zi': 'じ', 'zu': 'ず', 'ze': 'ぜ', 'zo': 'ぞ',
  'ji': 'じ', 'ja': 'じゃ', 'ju': 'じゅ', 'je': 'じぇ', 'jo': 'じょ',
  'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',
  'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
  'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
  'va': 'ゔぁ', 'vi': 'ゔぃ', 'vu': 'ゔ', 've': 'ゔぇ', 'vo': 'ゔぉ',
  // Palatalized
  'kya': 'きゃ', 'kyi': 'きぃ', 'kyu': 'きゅ', 'kye': 'きぇ', 'kyo': 'きょ',
  'gya': 'ぎゃ', 'gyi': 'ぎぃ', 'gyu': 'ぎゅ', 'gye': 'ぎぇ', 'gyo': 'ぎょ',
  'sya': 'しゃ', 'syi': 'しぃ', 'syu': 'しゅ', 'sye': 'しぇ', 'syo': 'しょ',
  'zya': 'じゃ', 'zyi': 'じぃ', 'zyu': 'じゅ', 'zye': 'じぇ', 'zyo': 'じょ',
  'tya': 'ちゃ', 'tyi': 'ちぃ', 'tyu': 'ちゅ', 'tye': 'ちぇ', 'tyo': 'ちょ',
  'cha': 'ちゃ', 'chi': 'ち',   'chu': 'ちゅ', 'che': 'ちぇ', 'cho': 'ちょ',
  'dya': 'ぢゃ', 'dyi': 'ぢぃ', 'dyu': 'ぢゅ', 'dye': 'ぢぇ', 'dyo': 'ぢょ',
  'nya': 'にゃ', 'nyi': 'にぃ', 'nyu': 'にゅ', 'nye': 'にぇ', 'nyo': 'にょ',
  'hya': 'ひゃ', 'hyi': 'ひぃ', 'hyu': 'ひゅ', 'hye': 'ひぇ', 'hyo': 'ひょ',
  'bya': 'びゃ', 'byi': 'びぃ', 'byu': 'びゅ', 'bye': 'びぇ', 'byo': 'びょ',
  'pya': 'ぴゃ', 'pyi': 'ぴぃ', 'pyu': 'ぴゅ', 'pye': 'ぴぇ', 'pyo': 'ぴょ',
  'mya': 'みゃ', 'myi': 'みぃ', 'myu': 'みゅ', 'mye': 'みぇ', 'myo': 'みょ',
  'rya': 'りゃ', 'ryi': 'りぃ', 'ryu': 'りゅ', 'rye': 'りぇ', 'ryo': 'りょ',
  // Small kana
  'xa': 'ぁ', 'xi': 'ぃ', 'xu': 'ぅ', 'xe': 'ぇ', 'xo': 'ぉ',
  'xya': 'ゃ', 'xyu': 'ゅ', 'xyo': 'ょ',
  'xtu': 'っ', 'xtsu': 'っ', 'xwa': 'ゎ',
  // tchi, ttsu
  'tchi': 'っち', 'ttsu': 'っつ',
  // fa, fi etc
  'fa': 'ふぁ', 'fi': 'ふぃ', 'fu': 'ふ', 'fe': 'ふぇ', 'fo': 'ふぉ',
  // ti, di
  'thi': 'てぃ', 'dhi': 'でぃ',
  'tha': 'てゃ', 'thu': 'てゅ', 'tho': 'てょ',
  'dha': 'でゃ', 'dhu': 'でゅ', 'dho': 'でょ',
  // wi, we
  'wyi': 'ゐ', 'wye': 'ゑ',
  '-': 'ー',
};

// Hiragana to Katakana offset
const HIRA_TO_KATA_OFFSET = 'ア'.codePointAt(0) - 'あ'.codePointAt(0);

function hiraToKata(str) {
  return str.replace(/[ぁ-ゖ]/g, c =>
    String.fromCodePoint(c.codePointAt(0) + HIRA_TO_KATA_OFFSET)
  );
}

class RomanKanaConverter {
  constructor() {
    this._buf = '';
  }

  reset() {
    this._buf = '';
  }

  get pending() {
    return this._buf;
  }

  // Feed one roman character, return {kana, leftover, consumed}
  // kana: converted kana string (may be empty)
  // leftover: remaining roman buffer (unconverted)
  // consumed: whether character was accepted
  feed(ch) {
    const lower = ch.toLowerCase();

    // Handle 'n' specially: if buffer is 'n' and new char is not a vowel or 'n' or 'y', commit ん
    if (this._buf === 'n' && lower !== 'n' && lower !== 'y' &&
        !'aiueo'.includes(lower)) {
      const kana = 'ん';
      this._buf = lower;
      // Try the new single char
      const result = this._tryConvert();
      return { kana, leftover: result.leftover };
    }

    this._buf += lower;

    // Check for double consonant (geminate) → っ
    if (this._buf.length === 2 && this._buf[0] === this._buf[1] &&
        !'aiueo'.includes(this._buf[0]) && this._buf[0] !== 'n') {
      const kana = 'っ';
      this._buf = this._buf[1]; // keep second char as new start
      return { kana, leftover: this._buf };
    }

    return this._tryConvert();
  }

  _tryConvert() {
    // Exact match
    if (ROMAN_KANA_TABLE[this._buf]) {
      const kana = ROMAN_KANA_TABLE[this._buf];
      this._buf = '';
      return { kana, leftover: '' };
    }

    // Check if any table key starts with current buffer (prefix match)
    const hasPrefix = Object.keys(ROMAN_KANA_TABLE).some(k => k.startsWith(this._buf));
    if (hasPrefix) {
      // Pending — need more input
      return { kana: '', leftover: this._buf };
    }

    // No match, no prefix: discard first char and retry with rest
    if (this._buf.length > 1) {
      const discarded = this._buf[0];
      this._buf = this._buf.slice(1);
      const retry = this._tryConvert();
      // Return discarded char as literal kana (output as-is)
      return { kana: discarded + retry.kana, leftover: retry.leftover };
    }

    // Single char, no match — output as-is (ASCII passthrough in non-ASCII mode shouldn't happen,
    // but just in case)
    const ch = this._buf;
    this._buf = '';
    return { kana: '', leftover: '', unmatched: ch };
  }

  // Force-commit whatever is pending (e.g. trailing 'n' → ん)
  flush() {
    if (this._buf === 'n' || this._buf === 'nn') {
      const kana = 'ん';
      this._buf = '';
      return { kana, leftover: '' };
    }
    const leftover = this._buf;
    this._buf = '';
    return { kana: '', leftover };
  }

  // Backspace: remove last char from buffer
  backspace() {
    if (this._buf.length > 0) {
      this._buf = this._buf.slice(0, -1);
      return true;
    }
    return false;
  }
}
