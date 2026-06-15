// Dictionary management: IndexedDB cache, SKK-JISYO.L auto-download, parser

const DB_NAME = 'skk-webeditor';
const DB_VERSION = 1;
const STORE_DICT = 'dictionary';
const STORE_META = 'meta';
const DICT_URL = 'https://raw.githubusercontent.com/skk-dev/dict/master/SKK-JISYO.L';

// Fallback mini dictionary (okuri-nashi only)
const FALLBACK_DICT = {
  'あ': ['亜', '阿', '唖', '娃', '阿'],
  'あい': ['愛', '藍', '哀', '挨', '相'],
  'あいす': ['愛す'],
  'あいする': ['愛する'],
  'あいだ': ['間', '合間'],
  'あいて': ['相手'],
  'あお': ['青', '蒼'],
  'あおい': ['青い', '蒼い'],
  'あか': ['赤', '朱'],
  'あかい': ['赤い'],
  'あかるい': ['明るい'],
  'あき': ['秋', '空き'],
  'あきら': ['明'],
  'あきらか': ['明らか'],
  'あく': ['悪', '灰汁'],
  'あくまで': ['飽くまで', 'あくまで'],
  'あける': ['開ける', '明ける'],
  'あさ': ['朝', '麻'],
  'あし': ['足', '脚', '葦'],
  'あした': ['明日', '明朝'],
  'あたらしい': ['新しい'],
  'あたり': ['辺り', '当たり'],
  'あちら': ['あちら'],
  'あつい': ['熱い', '暑い', '厚い'],
  'あと': ['後', '跡', '痕'],
  'あな': ['穴', '孔'],
  'あに': ['兄'],
  'あね': ['姉'],
  'あの': ['彼の'],
  'あひる': ['家鴨'],
  'あまい': ['甘い'],
  'あまり': ['余り'],
  'あみ': ['網'],
  'ある': ['或る', 'ある'],
  'あるく': ['歩く'],
  'あれ': ['彼れ', 'あれ'],
  'あわ': ['泡', '粟'],
  'あわせる': ['合わせる', '併せる'],
  'あんい': ['安易'],
  'あんぜん': ['安全'],
  'あんしん': ['安心'],
  'あんてい': ['安定'],
  'い': ['胃', '意', '異', '以'],
  'いい': ['良い', '好い'],
  'いいん': ['委員'],
  'いえ': ['家', '宅'],
  'いかが': ['如何'],
  'いき': ['息', '生き', '粋'],
  'いきる': ['生きる'],
  'いくつ': ['幾つ'],
  'いくら': ['幾ら'],
  'いけん': ['意見'],
  'いしゃ': ['医者'],
  'いじょう': ['以上', '異常'],
  'いそがしい': ['忙しい'],
  'いた': ['板', '痛'],
  'いたい': ['痛い'],
  'いち': ['一', '市', '位置'],
  'いちばん': ['一番'],
  'いつ': ['何時', '五', 'いつ'],
  'いつか': ['何時か', '五日'],
  'いつも': ['何時も', 'いつも'],
  'いのち': ['命'],
  'いま': ['今', '居間'],
  'いみ': ['意味'],
  'いもうと': ['妹'],
  'いる': ['居る', '要る', 'いる'],
  'いろ': ['色'],
  'いろいろ': ['色々'],
  'いわ': ['岩', '巌'],
  'うえ': ['上'],
  'うごく': ['動く'],
  'うしろ': ['後ろ'],
  'うた': ['歌', '詩'],
  'うたう': ['歌う'],
  'うち': ['内', '家', '打ち'],
  'うつくしい': ['美しい'],
  'うみ': ['海', '膿'],
  'うれしい': ['嬉しい'],
  'うんどう': ['運動'],
  'え': ['絵', '柄', '江'],
  'えいご': ['英語'],
  'えき': ['駅', '益', '液'],
  'えらい': ['偉い'],
  'えらぶ': ['選ぶ'],
  'えん': ['円', '縁', '園'],
  'おい': ['甥'],
  'おいしい': ['美味しい'],
  'おおい': ['多い'],
  'おおきい': ['大きい'],
  'おかあさん': ['お母さん'],
  'おかね': ['お金'],
  'おきる': ['起きる'],
  'おく': ['置く', '奥'],
  'おくる': ['送る', '贈る'],
  'おこなう': ['行う'],
  'おこる': ['起こる', '怒る'],
  'おじさん': ['叔父さん', '伯父さん'],
  'おしえる': ['教える'],
  'おす': ['押す', '雄'],
  'おそい': ['遅い', '遅い'],
  'おたく': ['お宅', 'オタク'],
  'おちる': ['落ちる'],
  'おてら': ['お寺'],
  'おとうさん': ['お父さん'],
  'おとうと': ['弟'],
  'おとこ': ['男'],
  'おとな': ['大人'],
  'おにい': ['お兄'],
  'おねえ': ['お姉'],
  'おもい': ['重い', '思い'],
  'おもう': ['思う'],
  'おもしろい': ['面白い'],
  'おりる': ['降りる', '下りる'],
  'おわる': ['終わる'],
  'おんがく': ['音楽'],
  'おんな': ['女'],
  'か': ['蚊', '香', '花', '課'],
  'かい': ['貝', '会', '絵', '階'],
  'かいしゃ': ['会社'],
  'かえる': ['帰る', '変える', '替える', '蛙'],
  'かお': ['顔'],
  'かかる': ['掛かる', '架かる'],
  'かき': ['柿', '牡蠣', '書き'],
  'かく': ['書く', '描く', '角', '核'],
  'かぜ': ['風', '風邪'],
  'かた': ['肩', '方', '型'],
  'かたい': ['固い', '硬い', '堅い'],
  'がっこう': ['学校'],
  'かど': ['角', '門'],
  'かなしい': ['悲しい'],
  'かね': ['金', '鐘'],
  'かのじょ': ['彼女'],
  'かみ': ['神', '紙', '髪', '上'],
  'から': ['空', '辛', 'から'],
  'かわ': ['川', '河', '革', '皮'],
  'かわいい': ['可愛い'],
  'かわる': ['変わる', '代わる'],
  'かんがえ': ['考え'],
  'かんがえる': ['考える'],
  'かんけい': ['関係'],
  'かんじ': ['漢字', '感じ'],
  'かんたん': ['簡単'],
  'き': ['木', '気', '気', '基', '期'],
  'きいろ': ['黄色'],
  'きえる': ['消える'],
  'きかい': ['機会', '機械'],
  'きく': ['聞く', '効く', '菊'],
  'きけん': ['危険'],
  'きせつ': ['季節'],
  'きた': ['北', '来た'],
  'きっぷ': ['切符'],
  'きのう': ['昨日', '機能'],
  'きぼう': ['希望'],
  'きほん': ['基本'],
  'きも': ['気も', '肝'],
  'きもち': ['気持ち'],
  'きゅう': ['九', '急', '球', '旧'],
  'きょう': ['今日', '京'],
  'きょうかい': ['教会', '境界'],
  'きょうし': ['教師'],
  'きょうと': ['京都'],
  'きょうみ': ['興味'],
  'きれい': ['綺麗', 'きれい'],
  'くだもの': ['果物'],
  'くち': ['口'],
  'くに': ['国'],
  'くも': ['雲', '蜘蛛'],
  'くら': ['倉', '蔵', '暗'],
  'くらい': ['暗い', 'ぐらい'],
  'くる': ['来る'],
  'くるま': ['車'],
  'くろ': ['黒'],
  'くろい': ['黒い'],
  'け': ['毛', '気', '家'],
  'けいかく': ['計画'],
  'けいざい': ['経済'],
  'けが': ['怪我'],
  'けっか': ['結果'],
  'けっこん': ['結婚'],
  'けん': ['犬', '県', '剣', '権', '件'],
  'けんきゅう': ['研究'],
  'こ': ['子', '個', '小'],
  'こい': ['鯉', '恋', '濃い'],
  'こうえん': ['公園', '公演'],
  'こうかん': ['交換', '好感'],
  'こえ': ['声'],
  'こころ': ['心'],
  'ここ': ['此処', 'ここ'],
  'こたえ': ['答え'],
  'こたえる': ['答える'],
  'ことば': ['言葉'],
  'こども': ['子供', '子ども'],
  'こない': ['来ない'],
  'このごろ': ['この頃'],
  'こまる': ['困る'],
  'これ': ['これ', '此れ'],
  'ころ': ['頃', 'ころ'],
  'こわい': ['怖い', '恐い'],
  'こんにちは': ['今日は'],
  'こんばんは': ['今晩は'],
  'さ': ['差', '佐', '左'],
  'さいきん': ['最近'],
  'さいご': ['最後'],
  'さいしょ': ['最初'],
  'さいてい': ['最低', '最低'],
  'さがす': ['探す', '捜す'],
  'さき': ['先', '崎'],
  'さくら': ['桜'],
  'さむい': ['寒い'],
  'さようなら': ['さようなら'],
  'さる': ['猿', '去る'],
  'さんにん': ['三人'],
  'し': ['四', '死', '詩', '師', '市', '氏', '誌'],
  'しあわせ': ['幸せ', '幸い'],
  'しごと': ['仕事'],
  'した': ['下', '舌', '下'],
  'したい': ['したい', '死体'],
  'しつもん': ['質問'],
  'しぬ': ['死ぬ'],
  'しぶい': ['渋い'],
  'しま': ['島', '縞'],
  'しめる': ['閉める', '締める'],
  'しゃかい': ['社会'],
  'しゃしん': ['写真'],
  'じゆう': ['自由'],
  'じょうほう': ['情報'],
  'しる': ['知る', '汁'],
  'しろ': ['城', '白', '代'],
  'しろい': ['白い'],
  'じんせい': ['人生'],
  'す': ['巣', '酢', '州'],
  'すき': ['好き', '隙', '鋤'],
  'すくない': ['少ない'],
  'すごい': ['凄い'],
  'すみ': ['墨', '炭', '隅'],
  'すむ': ['住む', '澄む'],
  'そだてる': ['育てる'],
  'そら': ['空'],
  'そろそろ': ['そろそろ'],
  'た': ['田', '他'],
  'たいへん': ['大変'],
  'たかい': ['高い', '貴い'],
  'たくさん': ['沢山', 'たくさん'],
  'たつ': ['立つ', '経つ', '竜', '達'],
  'たのしい': ['楽しい'],
  'たのむ': ['頼む'],
  'たべる': ['食べる'],
  'ちいさい': ['小さい'],
  'ちから': ['力'],
  'ちず': ['地図'],
  'ちかい': ['近い'],
  'ちち': ['父', '乳'],
  'ちょっと': ['ちょっと'],
  'つかう': ['使う'],
  'つき': ['月', '付き'],
  'つくる': ['作る', '造る'],
  'つたえる': ['伝える'],
  'つよい': ['強い'],
  'てがみ': ['手紙'],
  'でる': ['出る'],
  'でんき': ['電気'],
  'でんしゃ': ['電車'],
  'でんわ': ['電話'],
  'と': ['戸', '都', '徒', '途'],
  'とお': ['十', '遠'],
  'とおい': ['遠い'],
  'とき': ['時', '解き'],
  'ところ': ['所', '処'],
  'とし': ['年', '都市', '都市'],
  'とも': ['友', '共'],
  'な': ['名', '奈'],
  'なか': ['中', '仲'],
  'ながい': ['長い'],
  'なぜ': ['何故'],
  'なつ': ['夏'],
  'なまえ': ['名前'],
  'なる': ['成る', '鳴る', 'なる'],
  'に': ['二', '荷'],
  'にほん': ['日本'],
  'にほんご': ['日本語'],
  'ねこ': ['猫'],
  'ねる': ['寝る'],
  'は': ['葉', '刃', '歯'],
  'はいる': ['入る'],
  'はじまる': ['始まる'],
  'はじめ': ['始め', '初め'],
  'はじめて': ['初めて', '始めて'],
  'はたらく': ['働く'],
  'はなし': ['話', '花'],
  'はなす': ['話す', '離す'],
  'はは': ['母'],
  'はる': ['春', '張る', '貼る'],
  'はれ': ['晴れ'],
  'ひ': ['火', '日', '灯'],
  'ひかり': ['光'],
  'ひく': ['引く', '弾く', '低い'],
  'ひくい': ['低い'],
  'ひと': ['人', '一', '仁'],
  'ひとり': ['一人', '独り'],
  'ひろい': ['広い'],
  'ふ': ['不', '分', '部'],
  'ふゆ': ['冬'],
  'ふるい': ['古い'],
  'へ': ['部屋', '辺'],
  'へや': ['部屋'],
  'ほしい': ['欲しい'],
  'ほん': ['本', '本'],
  'まいにち': ['毎日'],
  'まえ': ['前'],
  'まち': ['町', '街', '待ち'],
  'みじかい': ['短い'],
  'みず': ['水'],
  'みせ': ['店'],
  'みる': ['見る', '診る'],
  'むずかしい': ['難しい'],
  'め': ['目', '芽'],
  'もの': ['物', '者', '門'],
  'やさしい': ['優しい', '易しい'],
  'やすい': ['安い', '易い'],
  'やま': ['山'],
  'ゆき': ['雪', '幸'],
  'よい': ['良い', '好い'],
  'よむ': ['読む'],
  'よる': ['夜', '寄る'],
  'わかい': ['若い'],
  'わかる': ['分かる', '判る'],
  'わたし': ['私', '渡し'],
  'ありがとう': ['有難う', 'ありがとう'],
  'おはよう': ['お早う'],
  'おやすみ': ['お休み'],
  'すみません': ['済みません', 'すみません'],
  'はじめまして': ['初めまして'],
};

class Dictionary {
  constructor() {
    this._entries = { ...FALLBACK_DICT };
    this._db = null;
    this._ready = false;
    this._onReady = null;
  }

  get isReady() { return this._ready; }

  async init(onProgress) {
    this._db = await this._openDB();
    const cached = await this._loadFromDB();
    if (cached) {
      this._entries = cached;
      this._ready = true;
      return { source: 'cache', count: Object.keys(cached).length };
    }
    // Download SKK-JISYO.L
    try {
      const entries = await this._downloadAndParse(onProgress);
      this._entries = entries;
      await this._saveToDB(entries);
      this._ready = true;
      return { source: 'download', count: Object.keys(entries).length };
    } catch (err) {
      console.warn('Dictionary download failed, using fallback:', err);
      this._ready = true;
      return { source: 'fallback', count: Object.keys(this._entries).length };
    }
  }

  lookup(yomi) {
    return this._entries[yomi] || [];
  }

  // Lookup with okurigana: yomi is reading without okurigana, okuri is okurigana char
  lookupOkuri(yomi, okuri) {
    const key = yomi + okuri;
    return this._entries[key] || [];
  }

  mergeEntries(newEntries) {
    this._entries = { ...this._entries, ...newEntries };
  }

  async clearCache() {
    if (!this._db) return;
    const tx = this._db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete('dict');
    const tx2 = this._db.transaction(STORE_DICT, 'readwrite');
    tx2.objectStore(STORE_DICT).clear();
    return new Promise(r => { tx2.oncomplete = r; });
  }

  async _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_DICT)) {
          db.createObjectStore(STORE_DICT);
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async _loadFromDB() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_DICT, 'readonly');
      const req = tx.objectStore(STORE_DICT).get('entries');
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror = e => reject(e.target.error);
    });
  }

  async _saveToDB(entries) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_DICT, 'readwrite');
      const req = tx.objectStore(STORE_DICT).put(entries, 'entries');
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  async _downloadAndParse(onProgress) {
    const resp = await fetch(DICT_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const total = parseInt(resp.headers.get('content-length') || '0');
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress && total > 0) {
        onProgress(received / total);
      } else if (onProgress) {
        onProgress(-1); // indeterminate
      }
    }

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return parseSKKJisyo(merged.buffer);
  }
}

function parseSKKJisyo(arrayBuffer) {
  const decoder = new TextDecoder('euc-jp');
  const text = decoder.decode(arrayBuffer);
  const entries = {};
  let inOkuriNashi = false;

  for (const line of text.split('\n')) {
    if (line.startsWith(';;')) {
      if (line.includes('okuri-nashi')) inOkuriNashi = true;
      continue;
    }
    if (line.startsWith(';') || line.trim() === '') continue;

    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 0) continue;

    const key = line.slice(0, spaceIdx);
    const rest = line.slice(spaceIdx + 1);

    if (!rest.startsWith('/')) continue;

    // Parse candidates between slashes, ignore annotation (text after semicolon)
    const candidates = rest.slice(1).split('/').filter(s => s.length > 0).map(s => {
      const semi = s.indexOf(';');
      return semi >= 0 ? s.slice(0, semi) : s;
    }).filter(s => s.length > 0);

    if (candidates.length > 0) {
      entries[key] = candidates;
    }
  }

  return entries;
}

function parseSKKJisyoUTF8(text) {
  const entries = {};
  for (const line of text.split('\n')) {
    if (line.startsWith(';') || line.trim() === '') continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 0) continue;
    const key = line.slice(0, spaceIdx);
    const rest = line.slice(spaceIdx + 1);
    if (!rest.startsWith('/')) continue;
    const candidates = rest.slice(1).split('/').filter(s => s.length > 0).map(s => {
      const semi = s.indexOf(';');
      return semi >= 0 ? s.slice(0, semi) : s;
    }).filter(s => s.length > 0);
    if (candidates.length > 0) entries[key] = candidates;
  }
  return entries;
}
