// 把單段經文（如「約翰福音 3:16-4:2」）轉成香港聖經公會
// 和合本修訂版（RCUV，繁體中文）網站的經文 URL。
//
// 網址格式：https://rcuv.hkbs.org.hk/RCUV1/{英文書卷縮寫}/{章節參照}/
// 直接用 https 最終位址：http 版會被伺服器 301 重導向到 https，
// 直連可省一次來回，開啟更快。
//   版本代碼用 RCUV1（和合本修訂版 繁體·神版）；用 RCUV 會依瀏覽器語言
//   被重新導向到簡體 RCUV1s，故須指定 RCUV1 以確保繁體。
//   - 只有章：        詩篇 23        -> /RCUV1/PSA/23/
//   - 章:單節：       約翰福音 3:16  -> /RCUV1/JHN/3:16/
//   - 同章節範圍：    詩篇 23:1-3    -> /RCUV1/PSA/23:1-3/
//   - 跨章節範圍：    約翰福音 3:16-4:2 -> /RCUV1/JHN/3:16-4:2/
//
// 另容忍手動輸入的中文數字（「三章1節」）與英文書名（「John 3:16」）。
// 無法解析的章節一律安全退回，絕不產生 404 連結。
// 多段經文（用「；」分隔）由呼叫端自行拆分後逐段呼叫。
import { BIBLE_BOOKS, getBookCode } from './bible-data';

const RCUV_BASE = 'https://rcuv.hkbs.org.hk/RCUV1';
const RCUV_HOME = 'https://rcuv.hkbs.org.hk/';

// 英文書名別名（與 66 卷順序對應）；bibleshort 縮寫另以大小寫不分方式比對
const ENGLISH_BOOK_NAMES: string[][] = [
  ['Genesis'], ['Exodus'], ['Leviticus'], ['Numbers'], ['Deuteronomy'],
  ['Joshua'], ['Judges'], ['Ruth'],
  ['1 Samuel', 'I Samuel'], ['2 Samuel', 'II Samuel'],
  ['1 Kings', 'I Kings'], ['2 Kings', 'II Kings'],
  ['1 Chronicles', 'I Chronicles'], ['2 Chronicles', 'II Chronicles'],
  ['Ezra'], ['Nehemiah'], ['Esther'],
  ['Job'], ['Psalm', 'Psalms'], ['Proverbs'], ['Ecclesiastes'],
  ['Song of Solomon', 'Song of Songs'],
  ['Isaiah'], ['Jeremiah'], ['Lamentations'], ['Ezekiel'], ['Daniel'],
  ['Hosea'], ['Joel'], ['Amos'], ['Obadiah'], ['Jonah'],
  ['Micah'], ['Nahum'], ['Habakkuk'], ['Zephaniah'],
  ['Haggai'], ['Zechariah'], ['Malachi'],
  ['Matthew'], ['Mark'], ['Luke'], ['John'], ['Acts'],
  ['Romans'], ['1 Corinthians', 'I Corinthians'], ['2 Corinthians', 'II Corinthians'],
  ['Galatians'], ['Ephesians'], ['Philippians'], ['Colossians'],
  ['1 Thessalonians', 'I Thessalonians'], ['2 Thessalonians', 'II Thessalonians'],
  ['1 Timothy', 'I Timothy'], ['2 Timothy', 'II Timothy'],
  ['Titus'], ['Philemon'], ['Hebrews'], ['James'],
  ['1 Peter', 'I Peter'], ['2 Peter', 'II Peter'],
  ['1 John', 'I John'], ['2 John', 'II John'], ['3 John', 'III John'],
  ['Jude'], ['Revelation', 'Revelations'],
];

// 全形數字轉半形
function toHalfWidthDigits(s: string): string {
  return s.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

// 中文數字（0-99）轉阿拉伯數字字串；非中文數字則原樣保留
const CN_NUM_CHARS = '零一二兩三四五六七八九十';
function convertCnNumber(token: string): string {
  if (!/^[零一二兩三四五六七八九十]+$/.test(token)) return token;
  if (token === '十') return '10';
  const tenIdx = token.indexOf('十');
  if (tenIdx === -1) {
    // 單純個位數（一二三...）
    return String([...token].map(cnDigit).reduce((a, b) => a * 10 + b, 0));
  }
  const tensPart = token.slice(0, tenIdx);
  const onesPart = token.slice(tenIdx + 1);
  const tens = tensPart ? cnDigit(tensPart) : 1;
  const ones = onesPart ? cnDigit(onesPart) : 0;
  return String(tens * 10 + ones);
}
function cnDigit(ch: string): number {
  return ({ 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[ch] ?? 0;
}

// 把章節參照正規化成 hkbs 接受的格式；無法完整解析時退回開頭的章
function normalizeRef(raw: string): string {
  let r = raw.trim();
  if (!r) return '1';

  // 中文數字 → 阿拉伯（逐段連續中文字轉換）
  r = r.replace(new RegExp(`[${CN_NUM_CHARS}]+`, 'g'), (m) => convertCnNumber(m));
  // 「第3章第1節」之類：去掉「第」，「章」轉冒號，「節」移除
  r = r.replace(/第/g, '').replace(/章/g, ':').replace(/節/g, '');
  // 移除所有空白
  r = r.replace(/\s+/g, '');

  // hkbs exmore 支援的五種格式
  const validPatterns = [
    /^\d+$/, // 23
    /^\d+-\d+$/, // 1-3（跨章）
    /^\d+:[\d,-]+$/, // 23:1-3（章:節）
    /^\d+:[\d,]+-\d+:[\d,]+$/, // 1:5-3:7（跨章節）
    /^\d+-\d+:[\d,]+$/, // 1-3:5
  ];
  if (validPatterns.some((p) => p.test(r))) return r;

  // 無法完整解析：至少退回開頭的章數字（不產生 404）
  const chapter = r.match(/^\d+/);
  return chapter ? chapter[0] : '1';
}

// bibleshort 縮寫小寫陣列（與 BIBLE_BOOKS 對齊）
const BIBLE_BOOKS_CODES_LOWER = BIBLE_BOOKS.map((b) => getBookCode(b.name)?.toLowerCase())
  .filter((c): c is string => Boolean(c));

interface BookMatch {
  code: string;
  consumed: number; // 書名在輸入字串中佔用的字元數
}

// 比對書卷（繁中最長前綴優先，其次英文全名 / 縮寫，大小寫不分）
function matchBook(input: string): BookMatch | null {
  const lower = input.toLowerCase();

  // 繁中書名：最長前綴優先
  const cnBook = BIBLE_BOOKS.filter((b) => input.startsWith(b.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (cnBook) {
    const code = getBookCode(cnBook.name);
    if (code) return { code, consumed: cnBook.name.length };
  }

  // 英文全名（要求後接空白或數字/冒號，避免前綴誤判）
  for (let i = 0; i < ENGLISH_BOOK_NAMES.length; i++) {
    for (const name of ENGLISH_BOOK_NAMES[i]) {
      const n = name.toLowerCase();
      if (lower.startsWith(n) && /[\s\d:]/.test(lower.charAt(n.length))) {
        const code = getBookCode(BIBLE_BOOKS[i].name);
        if (code) return { code, consumed: name.length };
      }
    }
  }

  // bibleshort 縮寫（GEN/JHN...），大小寫不分，後接空白
  const codeMatch = input.match(/^([0-9A-Za-z]{2,4})\s/);
  if (codeMatch) {
    const idx = BIBLE_BOOKS_CODES_LOWER.indexOf(codeMatch[1].toLowerCase());
    if (idx >= 0) {
      const code = getBookCode(BIBLE_BOOKS[idx].name);
      if (code) return { code, consumed: codeMatch[1].length };
    }
  }
  return null;
}

export function bibleUrl(scripture: string): string {
  // 規範化：trim、全形數字轉半形、全形冒號轉半形、
  // 各類減號/波浪號統一為半形 '-'、壓縮空白
  const normalized = toHalfWidthDigits(scripture)
    .trim()
    .replace(/：/g, ':')
    .replace(/[－—–~～]/g, '-')
    .replace(/\s+/g, ' ');

  if (!normalized) return RCUV_HOME;

  const matched = matchBook(normalized);
  if (!matched) {
    // 無法識別書卷（非標準名稱）：退回 RCUV 首頁，不產生 404
    return RCUV_HOME;
  }

  // 取出書名之後的章節參照再正規化
  const ref = normalizeRef(normalized.slice(matched.consumed));

  return `${RCUV_BASE}/${matched.code}/${ref}/`;
}
