import { normalizeLicenceClass } from '@xeprime/domain';
import { DRIVER_LICENCE_KIND } from '@xeprime/types';
import { isValidDateOnly } from '../../../common/date-only';
import type {
  DriverLicenceReading,
  ReadingConfidence,
  ReadingDocumentKind,
} from './driver-licence-reader';

/**
 * Từ CHỮ mà Tesseract đọc được trên ảnh ra các trường của một bằng lái — ADR 0057.
 *
 * Tesseract chỉ trả chữ thô, đọc sai vặt liên tục ("Có giá trị đến/EXBireS: 45/03/2031" cho
 * "Expires: 15/03/2031"). Vì vậy file này:
 *
 *  - Tìm NHÃN bằng so khớp gần đúng trên chữ đã bỏ dấu (`fold`) — "EXBIRES" vẫn là "EXPIRES".
 *  - Gắn giá trị theo vị trí của nhãn, có đường lui theo CẤU TRÚC thẻ (hai ngày dd/mm/yyyy trên
 *    mặt trước GPLX là ngày sinh và ngày hết hạn — ngày muộn hơn là hạn).
 *  - Chỉ sửa một lỗi đọc số khi giá trị đọc được KHÔNG THỂ đúng (ngày 45, năm 4996).
 *  - Gộp nhiều lượt đọc (mỗi lượt một cách xử lý ảnh) bằng BỎ PHIẾU: một giá trị được nhiều lượt
 *    đọc giống nhau mới đáng tin; lượt đọc lệch nhau thì độ tin cậy thấp ⇒ người duyệt.
 *
 * Thuần, không phụ thuộc Tesseract — test bằng chữ mẫu, không cần ảnh.
 */

export interface OcrWord {
  text: string;
  /** 0–100, Tesseract tự chấm. */
  confidence: number;
  /**
   * Độ tin cậy TỪNG KÝ TỰ, nếu có. Cần vì Tesseract hay dính số bằng vào chữ rác bên cạnh thành một
   * "từ" ("sine:790123456789") — điểm của cả từ bị phần rác kéo xuống dù 12 chữ số đọc đúng.
   */
  symbols?: { text: string; confidence: number }[];
}

/** Một dòng chữ theo thứ tự đọc. */
export type OcrLine = OcrWord[];

export interface Found<T> {
  value: T;
  /** 0–100 — trung bình độ tin cậy của các từ tạo nên giá trị. */
  confidence: number;
}

export interface Anchors {
  /** "GIẤY PHÉP LÁI XE". */
  vnTitle: boolean;
  /** Quốc hiệu Việt Nam — có cả trên CCCD, nên một mình nó không nói đây là bằng lái. */
  vnState: boolean;
  /** Giấy phép lái xe quốc tế. */
  idp: boolean;
  /** "DRIVER LICENSE" và các cách gọi bằng lái của nước khác. */
  licenceWord: boolean;
  /** Giấy tờ KHÁC hay bị nộp nhầm: CCCD/CMND, hộ chiếu, đăng ký xe. */
  otherDocument: boolean;
  /** Số cụm chữ đặc trưng của MẶT SAU (bảng các hạng xe). */
  backSide: number;
  /** Số nhãn trường của mặt trước đọc được (họ tên, ngày sinh, quốc tịch, hạng, hạn). */
  frontLabels: number;
}

/** Những gì MỘT lượt đọc tìm thấy. */
export interface PassFindings {
  anchors: Anchors;
  /** Số từ đọc được với độ tin cậy ≥ 60 — thước đo "ảnh có chữ đọc được không". */
  confidentWords: number;
  licenceNumber: Found<string> | null;
  fullName: Found<string> | null;
  dateOfBirth: Found<string> | null;
  expiresOn: Found<string> | null;
  noExpiry: Found<true> | null;
  issuedOn: Found<string> | null;
  classes: Found<string[]> | null;
  /**
   * Cho bằng NƯỚC NGOÀI / IDP — nơi bố cục mỗi nước một kiểu: lượt đọc có MỘT ngày tháng bất kỳ
   * không, và mã số giấy tờ đầu tiên (chữ + số, ≥ 4 chữ số). Hai thứ đó cộng chữ "driver licence"
   * là cấu trúc tối thiểu của một tấm bằng — ảnh một trang web nhắc tới bằng lái thì không có.
   */
  anyDate: boolean;
  documentNumber: Found<string> | null;
}

// ── Chuẩn hoá chữ ─────────────────────────────────────────────────────────────────────────

/** Bỏ dấu, `đ` → `D`, viết hoa, chỉ giữ A–Z/0–9, gom khoảng trắng. */
export function fold(text: string): string {
  return foldChars(text)
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function foldChars(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'D').toUpperCase();
}

/**
 * Một dòng đã chuẩn bị: chữ thô (các từ nối bằng MỘT khoảng trắng), khoá so khớp (đã `fold`, bỏ
 * cả khoảng trắng — Tesseract hay dính/tách từ), độ tin cậy của từng ký tự thô, và bảng ánh xạ để
 * từ một đoạn khớp ở khoá quay về đúng chữ thô.
 */
interface PreparedLine {
  raw: string;
  /** Vị trí ký tự thô → độ tin cậy 0–100 (khoảng trắng nối từ: -1). */
  charConfidence: number[];
  key: string;
  /** Vị trí ký tự của `key` → vị trí ký tự thô. */
  keyAt: number[];
}

function prepareLine(words: OcrLine): PreparedLine {
  let raw = '';
  const charConfidence: number[] = [];
  words.forEach((word, index) => {
    if (index > 0) {
      raw += ' ';
      charConfidence.push(-1);
    }
    raw += word.text;
    // Ký hiệu khớp trọn chữ của từ thì dùng điểm từng ký hiệu; không thì cả từ chung một điểm.
    const symbols = word.symbols;
    if (symbols && symbols.map((sym) => sym.text).join('') === word.text) {
      for (const sym of symbols) {
        for (let k = 0; k < sym.text.length; k += 1) charConfidence.push(sym.confidence);
      }
    } else {
      for (let k = 0; k < word.text.length; k += 1) charConfidence.push(word.confidence);
    }
  });
  let key = '';
  const keyAt: number[] = [];
  let offset = 0;
  for (const ch of raw) {
    const folded = foldChars(ch).replace(/[^A-Z0-9]/g, '');
    for (const out of folded) {
      key += out;
      keyAt.push(offset);
    }
    offset += ch.length;
  }
  return { raw, charConfidence, key, keyAt };
}

/** Trung bình độ tin cậy của các ký tự (không tính khoảng trắng) trong đoạn thô `[start, end)`. */
function spanConfidence(line: PreparedLine, start: number, end: number): number {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, start); i < Math.min(end, line.charConfidence.length); i += 1) {
    const value = line.charConfidence[i] ?? -1;
    if (value < 0 || /\s/.test(line.raw[i] ?? ' ')) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

// ── So khớp gần đúng ──────────────────────────────────────────────────────────────────────

interface Match {
  distance: number;
  /** Vị trí (trong `key`) ngay SAU đoạn khớp. */
  end: number;
}

/**
 * Khoảng cách sửa nhỏ nhất từ `needle` tới MỘT ĐOẠN BẤT KỲ của `haystack` (thuật toán Sellers),
 * kèm điểm kết thúc của đoạn đó. Hoà khoảng cách thì lấy đoạn kết thúc sớm nhất.
 */
export function approximateFind(haystack: string, needle: string): Match {
  const m = needle.length;
  let prev: number[] = Array.from({ length: m + 1 }, (_, i) => i);
  let best: Match = { distance: m, end: 0 };
  for (let j = 0; j < haystack.length; j += 1) {
    const cur: number[] = [0];
    for (let i = 1; i <= m; i += 1) {
      const cost = needle[i - 1] === haystack[j] ? 0 : 1;
      cur[i] = Math.min((prev[i] ?? 0) + 1, (cur[i - 1] ?? 0) + 1, (prev[i - 1] ?? 0) + cost);
    }
    const distance = cur[m] ?? m;
    if (distance < best.distance) best = { distance, end: j + 1 };
    prev = cur;
  }
  return best;
}

/** Một nhãn: các cách viết (đã fold, bỏ khoảng trắng) kèm số lỗi đọc chấp nhận được. */
type Phrase = readonly [text: string, maxEdits: number];

/** Khớp nhãn trên một dòng — lấy cách viết DÀI NHẤT khớp được, để cắt trọn nhãn song ngữ. */
function matchPhrase(line: PreparedLine, phrases: readonly Phrase[]): Match | null {
  let best: (Match & { length: number }) | null = null;
  for (const [text, maxEdits] of phrases) {
    if (line.key.length < text.length - maxEdits) continue;
    const found = approximateFind(line.key, text);
    if (found.distance > maxEdits) continue;
    if (!best || text.length > best.length) best = { ...found, length: text.length };
  }
  return best ? { distance: best.distance, end: best.end } : null;
}

/** Vị trí thô ngay sau một đoạn khớp. */
function rawEnd(line: PreparedLine, match: Match): number {
  const last = line.keyAt[match.end - 1];
  if (last === undefined) return 0;
  // `keyAt` trỏ vào ĐẦU ký tự cuối; cộng độ dài ký tự đó (ký tự ngoài BMP chiếm 2 code unit).
  const ch = line.raw.codePointAt(last) ?? 0;
  return last + (ch > 0xffff ? 2 : 1);
}

const PHRASES = {
  vnTitle: [['GIAYPHEPLAIXE', 3]],
  vnState: [
    ['CONGHOAXAHOICHUNGHIAVIETNAM', 5],
    ['SOCIALISTREPUBLICOFVIETNAM', 5],
    ['DOCLAPTUDOHANHPHUC', 3],
  ],
  idp: [
    ['INTERNATIONALDRIVINGPERMIT', 5],
    ['PERMISDECONDUIREINTERNATIONAL', 5],
    ['GIAYPHEPLAIXEQUOCTE', 3],
    ['CONVENTIONONROADTRAFFIC', 4],
  ],
  licenceWord: [
    ['DRIVERSLICENSE', 2],
    ['DRIVERLICENSE', 2],
    ['DRIVINGLICENCE', 2],
    ['DRIVINGLICENSE', 2],
    ['DRIVERLICENCE', 2],
    ['PERMISDECONDUIRE', 3],
    ['FUHRERSCHEIN', 2],
    ['LICENCIADECONDUCIR', 3],
    ['PATENTEDIGUIDA', 2],
  ],
  otherDocument: [
    ['CANCUOC', 1],
    ['CITIZENIDENTITY', 3],
    ['IDENTITYCARD', 2],
    ['CHUNGMINHNHANDAN', 3],
    // KHỚP ĐÚNG: một lỗi đọc là "HOCHIEINH" — chữ "TP. Hồ Chí Minh" in trên bằng cấp ở TP.HCM.
    ['HOCHIEU', 0],
    ['PASSPORT', 1],
    ['CHUNGNHANDANGKYXE', 3],
    ['VEHICLEREGISTRATION', 3],
  ],
  backSide: [
    ['CACLOAIXECOGIOI', 3],
    ['DUOCDIEUKHIEN', 2],
    ['XEMOTOHAIBANH', 2],
    ['OTOCHONGUOI', 2],
    ['DUNGTICHXILANH', 3],
    ['TRONGTAI', 1],
  ],
  name: [
    ['HOVATENFULLNAME', 3],
    ['HOTENFULLNAME', 3],
    ['FULLNAME', 2],
    ['HOVATEN', 1],
    ['HOTEN', 1],
  ],
  dob: [
    ['NGAYSINHDATEOFBIRTH', 4],
    ['DATEOFBIRTH', 2],
    ['NGAYSINH', 2],
  ],
  nationality: [
    ['QUOCTICHNATIONALITY', 4],
    ['NATIONALITY', 2],
    ['QUOCTICH', 1],
  ],
  // "HANG" một mình KHÔNG phải nhãn: một sai số đã biến "HANH" (Hạnh phúc) thành nó.
  classes: [
    ['HANGCLASS', 2],
    ['CLASS', 1],
  ],
  expiry: [
    ['COGIATRIDENEXPIRES', 4],
    ['COGIATRIDEN', 2],
    ['NGAYHETHAN', 2],
    ['DATEOFEXPIRY', 2],
    ['VALIDUNTIL', 2],
    ['EXPIRES', 1],
    ['EXPIRY', 1],
  ],
  noExpiry: [
    ['KHONGTHOIHAN', 2],
    ['UNLIMITED', 2],
  ],
  issue: [
    ['NGAYCAPDATEOFISSUE', 4],
    ['DATEOFISSUE', 2],
    ['NGAYCAP', 1],
  ],
  beginning: [
    ['NGAYTRUNGTUYENBEGINNINGDATE', 5],
    ['BEGINNINGDATE', 3],
    ['NGAYTRUNGTUYEN', 3],
  ],
} as const satisfies Record<string, readonly Phrase[]>;

// ── Số và ngày ────────────────────────────────────────────────────────────────────────────

/**
 * Trong một cụm chủ yếu là số, chữ cái trông giống số là số: `O` → 0, `I`/`l`/`|` → 1. Cụm chữ
 * thường (họ tên, nhãn) không bị đụng tới.
 */
function digitize(raw: string): string {
  return raw.replace(/\S+/g, (token) => {
    const digits = (token.match(/\d/g) ?? []).length;
    const lookalikes = (token.match(/[OoIl|]/g) ?? []).length;
    if (digits === 0 || digits < lookalikes) return token;
    return token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
  });
}

/** Chữ số đầu bị đọc nhầm phổ biến nhất của Tesseract với số `1`. */
const LEADING_ONE_LOOKALIKES = ['4', '7'];

/**
 * `dd`, `mm`, `yyyy` (đã lọc chữ số) → `YYYY-MM-DD` có thật, hoặc `null`. Một phần KHÔNG THỂ đúng
 * (ngày 45, tháng 40, năm 4996) thì thử thay chữ số đầu đọc nhầm của `1` — đúng một lần sửa.
 */
export function toIsoDate(dd: string, mm: string, yyyy: string): string | null {
  const attempt = (d: string, m: string, y: string): string | null => {
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const year = Number(y);
    return year >= 1900 && year <= 2100 && isValidDateOnly(iso) ? iso : null;
  };
  const direct = attempt(dd, mm, yyyy);
  if (direct) return direct;

  const repairs = (part: string, valid: (n: number) => boolean): string[] =>
    valid(Number(part))
      ? [part]
      : LEADING_ONE_LOOKALIKES.includes(part[0] ?? '')
        ? [`1${part.slice(1)}`]
        : [];
  const days = repairs(dd, (n) => n >= 1 && n <= 31);
  const months = repairs(mm, (n) => n >= 1 && n <= 12);
  const years = repairs(yyyy, (n) => n >= 1900 && n <= 2100);
  for (const d of days) {
    for (const m of months) {
      for (const y of years) {
        const iso = attempt(d, m, y);
        if (iso) return iso;
      }
    }
  }
  return null;
}

interface DateHit {
  iso: string;
  confidence: number;
  /** Chữ đứng TRƯỚC ngày trên cùng dòng (hoặc dòng trên, nếu ngày đứng đầu dòng). */
  label: PreparedLine;
}

/** dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy — chấp nhận khoảng trắng lạc giữa các chữ số năm. */
const NUMERIC_DATE = /(?<!\d)(\d{1,3})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d\s?\d\s?\d\s?\d)(?![\d/])/g;
/** "ngày 15 tháng 03 năm 2021" — đã fold: "NGAY 15 THANG 03 NAM 2021". */
const WORDED_DATE = /(\d{1,2}) T[A-Z]{3,5} (\d{1,2}) N[A-Z]{1,3} (\d{4})(?!\d)/;

function findNumericDates(lines: PreparedLine[]): DateHit[] {
  const hits: DateHit[] = [];
  lines.forEach((line, index) => {
    const text = digitize(line.raw);
    let cursor = 0;
    for (const match of text.matchAll(NUMERIC_DATE)) {
      const start = match.index;
      const iso = toIsoDate(
        (match[1] ?? '').slice(-2),
        match[2] ?? '',
        (match[3] ?? '').replace(/\s/g, ''),
      );
      const before = line.raw.slice(cursor, start);
      cursor = start + match[0].length;
      if (!iso) continue;
      const previous = index > 0 ? lines[index - 1] : undefined;
      const label =
        fold(before).replace(/[^A-Z]/g, '').length < 3 && previous
          ? previous
          : prepareLine([{ text: before, confidence: 0 }]);
      hits.push({ iso, confidence: spanConfidence(line, start, cursor), label });
    }
  });
  return hits;
}

// ── Hạng ──────────────────────────────────────────────────────────────────────────────────

/** Mọi hạng GPLX Việt Nam (mẫu cũ + mẫu 2025, kể cả hạng không lái được xe cho thuê) và IDP. */
const KNOWN_CLASSES = new Set(
  'A1 A2 A3 A4 A · B1 B2 B BE · C1 C C1E CE · D1 D2 D D1E D2E DE · E F FB2 FC FD FE'
    .split(' ')
    .filter((c) => c !== '·'),
);

/**
 * Một cụm chữ → một hạng, sửa đúng các lỗi đọc đã gặp (`82` → B2, `Al` → A1).
 *
 * Ký tự ĐẦU phải là chữ IN HOA (hạng in hoa trên bằng) hoặc `8`/`4` (đọc nhầm của B/A): nhiễu hay
 * gặp nhất của Tesseract là một chữ thường lẻ (`e`, `c`, `d`), và E/C/D cũ là hạng Ô TÔ — viết
 * hoa nó lên là biến một bằng xe máy thành bằng ô tô.
 */
export function readClassToken(token: string): string | null {
  const head = token.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0);
  if (!/\p{Lu}/u.test(head) && head !== '8' && head !== '4') return null;
  let t = foldChars(token).replace(/[^A-Z0-9]/g, '');
  if (t.length === 0 || t.length > 4) return null;
  if (t[0] === '8') t = `B${t.slice(1)}`;
  if (t[0] === '4' && t.length === 2) t = `A${t.slice(1)}`;
  t = t.charAt(0) + t.slice(1).replace(/[IL]/g, '1').replace(/Z/g, '2');
  const value = normalizeLicenceClass(t);
  return value && KNOWN_CLASSES.has(value) ? value : null;
}

/** Cụm hạng mà Tesseract tự chấm dưới mức này là nhiễu, không phải chữ in trên bằng. */
const CLASS_MIN_CONFIDENCE = 50;

interface Token {
  text: string;
  confidence: number;
}

/** Các cụm chữ của một dòng từ vị trí thô `from`, tách ở khoảng trắng và dấu phân cách. */
function tokensFrom(line: PreparedLine, from: number): Token[] {
  const tokens: Token[] = [];
  for (const match of line.raw.slice(from).matchAll(/[^\s,;:/|]+/g)) {
    if (!/[\p{L}\p{N}]/u.test(match[0])) continue;
    const start = from + match.index;
    tokens.push({
      text: match[0],
      confidence: spanConfidence(line, start, start + match[0].length),
    });
  }
  return tokens;
}

function classOf(token: Token): string | null {
  return token.confidence >= CLASS_MIN_CONFIDENCE ? readClassToken(token.text) : null;
}

/** DÃY hạng liền nhau ở đầu `tokens` — dừng ở cụm đầu tiên không phải hạng. */
function leadingClasses(tokens: Token[]): string[] {
  const classes: string[] = [];
  for (const token of tokens) {
    const value = classOf(token);
    if (!value) break;
    if (!classes.includes(value)) classes.push(value);
  }
  return classes;
}

/** Một dòng CHỈ gồm hạng (tối đa 6 cụm), hoặc rỗng. */
function classOnlyLine(line: PreparedLine): string[] {
  const tokens = tokensFrom(line, 0);
  if (tokens.length === 0 || tokens.length > 6) return [];
  const classes = leadingClasses(tokens);
  return classes.length > 0 && tokens.every((t) => classOf(t) !== null) ? classes : [];
}

// ── Họ tên ────────────────────────────────────────────────────────────────────────────────

/** Họ tên in HOA trên bằng: 2–7 chữ, toàn chữ cái. Không đạt ⇒ `null`. */
function cleanName(text: string): string | null {
  const letters = text
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = letters.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 7) return null;
  const chars = letters.replace(/\s/g, '');
  if (chars.length < 4 || chars.length > 60) return null;
  const upper = [...chars].filter((c) => c === c.toLocaleUpperCase('vi-VN')).length;
  if (upper / chars.length < 0.7) return null;
  return words.join(' ').toLocaleUpperCase('vi-VN');
}

// ── Một lượt đọc ──────────────────────────────────────────────────────────────────────────

export function analysePass(ocrLines: readonly OcrLine[]): PassFindings {
  const lines = ocrLines.filter((l) => l.length > 0).map(prepareLine);
  const has = (phrases: readonly Phrase[]): boolean =>
    lines.some((line) => matchPhrase(line, phrases) !== null);
  const linesWith = (phrases: readonly Phrase[]) =>
    lines.flatMap((line, index) => {
      const match = matchPhrase(line, phrases);
      return match ? [{ line, index, match }] : [];
    });

  const confidentWords = ocrLines
    .flat()
    .filter((w) => w.confidence >= 60 && /[\p{L}\p{N}]{2,}/u.test(w.text)).length;

  const anchors: Anchors = {
    vnTitle: has(PHRASES.vnTitle),
    vnState: has(PHRASES.vnState),
    idp: has(PHRASES.idp),
    licenceWord: has(PHRASES.licenceWord),
    otherDocument: has(PHRASES.otherDocument),
    backSide: PHRASES.backSide.filter((phrase) => has([phrase])).length,
    frontLabels: [
      PHRASES.name,
      PHRASES.dob,
      PHRASES.nationality,
      PHRASES.classes,
      PHRASES.expiry,
    ].filter(has).length,
  };

  return {
    anchors,
    confidentWords,
    licenceNumber: findLicenceNumber(lines),
    fullName: findName(lines, linesWith(PHRASES.name)),
    ...findDates(lines),
    noExpiry: findNoExpiry(linesWith(PHRASES.noExpiry)),
    classes: findClasses(lines, linesWith(PHRASES.classes)),
    anyDate: lines.some((line) => ANY_DATE.test(digitize(line.raw))),
    documentNumber: findDocumentNumber(lines),
  };
}

/** Ngày tháng ở bất kỳ thứ tự / dấu phân cách nào (dd.mm.yyyy, mm/dd/yyyy, yyyy-mm-dd). */
const ANY_DATE =
  /(?<!\d)(\d{1,2}\s?[/.-]\s?\d{1,2}\s?[/.-]\s?\d{2,4}|\d{4}\s?[/.-]\s?\d{1,2}\s?[/.-]\s?\d{1,2})(?!\d)/;

/**
 * Mã số trên một giấy tờ nước ngoài: một cụm chữ HOA/số (gạch nối được) dài ≥ 6, có ≥ 4 chữ số,
 * không phải ngày. Ưu tiên cụm trên dòng có nhãn số (No, DL, Permit, Licence, Number, Nr).
 */
function findDocumentNumber(lines: PreparedLine[]): Found<string> | null {
  let first: Found<string> | null = null;
  for (const line of lines) {
    const labelled = /(^| )(NO|DL|PERMIT|LICEN[CS]E|NUMBER|NR|NUMERO|NUMMER)( |$)/.test(
      fold(line.raw),
    );
    for (const match of line.raw.matchAll(/[A-Z0-9][A-Z0-9-]{5,}/g)) {
      const token = match[0].replace(/-+$/, '');
      if ((token.match(/\d/g) ?? []).length < 4 || ANY_DATE.test(token)) continue;
      const found = {
        value: token,
        confidence: spanConfidence(line, match.index, match.index + token.length),
      };
      if (labelled) return found;
      first ??= found;
    }
  }
  return first;
}

/** Số GPLX Việt Nam: đúng 12 chữ số. Có nhiều ⇒ ưu tiên số trên dòng có nhãn "Số/No". */
function findLicenceNumber(lines: PreparedLine[]): Found<string> | null {
  const hits: (Found<string> & { labelled: boolean })[] = [];
  for (const line of lines) {
    const text = digitize(line.raw);
    for (const match of text.matchAll(/(?<!\d)\d{12}(?!\d)/g)) {
      hits.push({
        value: match[0],
        confidence: spanConfidence(line, match.index, match.index + 12),
        labelled: /(^|[^A-Z])(SO|NO)([^A-Z]|$)/.test(fold(line.raw.slice(0, match.index))),
      });
    }
  }
  const hit = hits.find((h) => h.labelled) ?? hits[0];
  return hit ? { value: hit.value, confidence: hit.confidence } : null;
}

function findName(
  lines: PreparedLine[],
  labelled: { line: PreparedLine; index: number; match: Match }[],
): Found<string> | null {
  for (const { line, index, match } of labelled) {
    const start = rawEnd(line, match);
    const sameLine = cleanName(line.raw.slice(start));
    if (sameLine)
      return { value: sameLine, confidence: spanConfidence(line, start, line.raw.length) };
    const next = lines[index + 1];
    const nextName = next ? cleanName(next.raw) : null;
    if (next && nextName)
      return { value: nextName, confidence: spanConfidence(next, 0, next.raw.length) };
  }
  return null;
}

function findDates(
  lines: PreparedLine[],
): Pick<PassFindings, 'dateOfBirth' | 'expiresOn' | 'issuedOn'> {
  const dates = findNumericDates(lines);
  const labelOf = (hit: DateHit) =>
    matchPhrase(hit.label, PHRASES.beginning)
      ? 'beginning'
      : matchPhrase(hit.label, PHRASES.issue)
        ? 'issue'
        : matchPhrase(hit.label, PHRASES.expiry)
          ? 'expiry'
          : matchPhrase(hit.label, PHRASES.dob)
            ? 'dob'
            : null;
  const labelled = dates.map((hit) => ({ hit, kind: labelOf(hit) }));
  const pick = (kind: string) => {
    const found = labelled.find((d) => d.kind === kind)?.hit;
    return found ? { value: found.iso, confidence: found.confidence } : null;
  };

  let dateOfBirth = pick('dob');
  let expiresOn = pick('expiry');
  let issuedOn = pick('issue');

  // Ngày cấp mẫu PET: "TP. Hồ Chí Minh, ngày 15 tháng 03 năm 2021".
  if (!issuedOn) {
    for (const line of lines) {
      const match = WORDED_DATE.exec(fold(digitize(line.raw)));
      const iso = match ? toIsoDate(match[1] ?? '', match[2] ?? '', match[3] ?? '') : null;
      if (iso) {
        issuedOn = { value: iso, confidence: spanConfidence(line, 0, line.raw.length) };
        break;
      }
    }
  }

  // Đường lui theo cấu trúc: nhãn đọc hỏng nhưng ngày còn nguyên. Trên mặt trước GPLX, các ngày
  // dd/mm/yyyy KHÔNG nhãn là ngày sinh và ngày hết hạn (ngày cấp viết bằng chữ, ngày trúng tuyển
  // chỉ có tháng/năm) — ngày sớm nhất là ngày sinh, ngày muộn nhất là hạn. Cần ÍT NHẤT HAI ngày:
  // một ngày đơn lẻ không nói được nó là gì. Độ tin cậy hạ vì đây là suy luận, không phải đọc.
  const unlabelled = labelled
    .filter((d) => d.kind === null && d.hit.iso !== issuedOn?.value)
    .map((d) => d.hit)
    .sort((a, b) => a.iso.localeCompare(b.iso));
  const earliest = unlabelled[0];
  const latest = unlabelled[unlabelled.length - 1];
  if (earliest && latest && earliest.iso !== latest.iso) {
    dateOfBirth ??= { value: earliest.iso, confidence: earliest.confidence * 0.8 };
    expiresOn ??= { value: latest.iso, confidence: latest.confidence * 0.8 };
  }
  return { dateOfBirth, expiresOn, issuedOn };
}

function findNoExpiry(labelled: { line: PreparedLine; match: Match }[]): Found<true> | null {
  const first = labelled[0];
  return first
    ? { value: true, confidence: spanConfidence(first.line, 0, first.line.raw.length) }
    : null;
}

/**
 * Hạng: các cụm sau nhãn "Hạng/Class" trên cùng dòng; không có thì dòng ngay trên/dưới NẾU dòng đó
 * chỉ gồm hạng — chữ hạng in to hơn nhãn nên Tesseract hay tách nó thành một dòng riêng.
 */
function findClasses(
  lines: PreparedLine[],
  labelled: { line: PreparedLine; index: number; match: Match }[],
): Found<string[]> | null {
  for (const { line, index, match } of labelled) {
    const start = rawEnd(line, match);
    const tokens = tokensFrom(line, start);
    const sameLine = leadingClasses(tokens);
    if (sameLine.length > 0) {
      const used = tokens.slice(0, sameLine.length);
      const confidence = used.reduce((sum, t) => sum + t.confidence, 0) / used.length;
      return { value: sameLine, confidence };
    }
    // Hai dòng kề đều "chỉ gồm hạng" thì không biết dòng nào là của nhãn này — không đoán.
    const candidates = [lines[index - 1], lines[index + 1]].flatMap((neighbour) => {
      const classes = neighbour ? classOnlyLine(neighbour) : [];
      return neighbour && classes.length > 0 ? [{ neighbour, classes }] : [];
    });
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only) {
      return {
        value: only.classes,
        confidence: spanConfidence(only.neighbour, 0, only.neighbour.raw.length),
      };
    }
  }
  return null;
}

/** Điểm "ảnh này đúng chiều và có chữ của một giấy tờ" — dùng để chọn chiều xoay ảnh. */
export function orientationScore(findings: PassFindings): number {
  const a = findings.anchors;
  return (
    (a.vnTitle ? 2 : 0) +
    (a.vnState ? 1 : 0) +
    (a.idp ? 2 : 0) +
    (a.licenceWord ? 1 : 0) +
    (a.otherDocument ? 2 : 0) +
    a.backSide +
    a.frontLabels +
    (findings.licenceNumber ? 2 : 0)
  );
}

// ── Gộp nhiều lượt đọc ────────────────────────────────────────────────────────────────────

interface Vote<T> {
  value: T | null;
  confidence: ReadingConfidence;
  /** "2/3" — để ghi chú cho người duyệt. */
  agreement: string;
}

/** Giá trị Tesseract tự chấm dưới mức này không được bỏ phiếu — coi như lượt đó không đọc được. */
const MIN_VOTE_CONFIDENCE = 40;
/** Hai lượt khớp nhau mà Tesseract vẫn chấm thấp (cùng một nhiễu lặp lại) thì chưa phải "cao". */
const HIGH_VOTE_CONFIDENCE = 70;

/**
 * Bỏ phiếu một trường qua các lượt đọc. Chỉ đáng tin khi ÍT NHẤT HAI lượt đọc giống nhau và nhiều
 * hơn phần lệch (ADR 0057 điều 2b) — một lượt đơn lẻ, dù Tesseract chấm cao, vẫn là tin cậy THẤP:
 * ba cách xử lý ảnh dùng chung một ảnh gốc, nên điều chỉ một lượt thấy thường là nhiễu.
 */
function vote<T>(found: (Found<T> | null)[], keyOf: (value: T) => string): Vote<T> {
  const present = found.filter(
    (f): f is Found<T> => f !== null && f.confidence >= MIN_VOTE_CONFIDENCE,
  );
  if (present.length === 0)
    return { value: null, confidence: 'low', agreement: `0/${found.length}` };
  const groups = new Map<string, Found<T>[]>();
  for (const f of present) {
    const key = keyOf(f.value);
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const ranked = [...groups.values()].sort(
    (a, b) =>
      b.length - a.length ||
      Math.max(...b.map((f) => f.confidence)) - Math.max(...a.map((f) => f.confidence)),
  );
  const winner = ranked[0] ?? [];
  const agree = winner.length;
  const dissent = present.length - agree;
  const best = Math.max(...winner.map((f) => f.confidence));
  const confidence: ReadingConfidence =
    agree >= 2 && agree > dissent * 2 && best >= HIGH_VOTE_CONFIDENCE
      ? 'high'
      : agree >= 2 && agree > dissent
        ? 'medium'
        : 'low';
  return {
    value: winner[0]?.value ?? null,
    confidence,
    agreement: `${agree}/${found.length}`,
  };
}

const RANK: Record<ReadingConfidence, number> = { low: 0, medium: 1, high: 2 };

/** Một tấm bằng có vài chục chữ; quá số này là một trang chữ (bài viết, hợp đồng), không phải bằng. */
const MAX_CARD_WORDS = 150;

export interface MergeContext {
  qualityIssues: DriverLicenceReading['qualityIssues'];
  /** Góc đã xoay ảnh để đọc (0 khi ảnh đúng chiều). */
  rotation: number;
}

/** Gộp các lượt đọc của CÙNG một ảnh thành một `DriverLicenceReading`. */
export function mergePasses(
  passes: readonly PassFindings[],
  context: MergeContext,
): DriverLicenceReading {
  const any = (key: keyof Omit<Anchors, 'backSide' | 'frontLabels'>) =>
    passes.some((p) => p.anchors[key]);
  const most = (key: 'backSide' | 'frontLabels') =>
    Math.max(0, ...passes.map((p) => p.anchors[key]));
  const confidentWords = Math.max(0, ...passes.map((p) => p.confidentWords));

  const number = vote(
    passes.map((p) => p.licenceNumber),
    (v) => v,
  );
  const name = vote(
    passes.map((p) => p.fullName),
    (v) => v,
  );
  const dob = vote(
    passes.map((p) => p.dateOfBirth),
    (v) => v,
  );
  const issued = vote(
    passes.map((p) => p.issuedOn),
    (v) => v,
  );
  const classes = vote(
    passes.map((p) => p.classes),
    (v) => [...v].sort().join(','),
  );
  // "Không thời hạn" và một ngày hết hạn là HAI câu trả lời cho cùng một câu hỏi — bỏ phiếu chung.
  const expiry = vote<string>(
    passes.map((p) =>
      p.noExpiry ? { value: 'none', confidence: p.noExpiry.confidence } : p.expiresOn,
    ),
    (v) => v,
  );

  const backSide = most('backSide') >= 2 && !number.value && !name.value;
  const documentNumber = vote(
    passes.map((p) => p.documentNumber),
    (v) => v,
  );
  let documentKind: ReadingDocumentKind;
  let readable = confidentWords >= 8 || number.value !== null;
  if (any('otherDocument') && !any('vnTitle') && !any('idp') && !any('licenceWord')) {
    documentKind = 'not_a_licence';
  } else if (any('idp')) {
    documentKind = DRIVER_LICENCE_KIND.INTERNATIONAL_PERMIT;
  } else if (
    backSide ||
    any('vnTitle') ||
    any('vnState') ||
    (number.value !== null && most('frontLabels') >= 2)
  ) {
    documentKind = DRIVER_LICENCE_KIND.VN;
  } else if (any('licenceWord')) {
    documentKind = DRIVER_LICENCE_KIND.FOREIGN;
  } else if (
    most('frontLabels') === 0 &&
    most('backSide') === 0 &&
    number.value === null &&
    name.value === null
  ) {
    // KHÔNG MỘT dấu hiệu nào của bằng lái — không tiêu đề, không nhãn trường, không số bằng, không
    // bảng hạng. Ảnh linh tinh (kể cả chữ nước ngoài Tesseract không đọc nổi) bị từ chối NGAY, không
    // được nhờ xem lại: hàng đợi duyệt tay là cho bằng lái máy đọc chưa chắc, không phải cho rác.
    // Một tấm bằng thật chụp nhoè tới mức không còn nhận ra chữ nào cũng rơi vào đây — khách chụp
    // lại (gợi ý chất lượng ảnh đi kèm), đúng cái giá "một ít từ chối oan" đã chấp nhận.
    documentKind = 'not_a_licence';
  } else {
    // Có dấu hiệu bằng lái (nhãn trường, số bằng…) nhưng không đủ để chắc chắn ⇒ "chụp lại cho
    // rõ", và khách được nhờ người xem lại nếu ảnh thật ra đã rõ.
    documentKind = DRIVER_LICENCE_KIND.VN;
    readable = false;
  }

  const isVn = documentKind === DRIVER_LICENCE_KIND.VN;
  if (
    documentKind === DRIVER_LICENCE_KIND.FOREIGN ||
    documentKind === DRIVER_LICENCE_KIND.INTERNATIONAL_PERMIT
  ) {
    // Chữ "driver licence" thôi chưa đủ. Cả một trang chữ (bài viết, trang web nói về bằng lái) là
    // ảnh linh tinh ⇒ từ chối ngay. Cỡ một tấm thẻ mà thiếu ngày tháng hoặc mã số giấy tờ ⇒ "chụp
    // lại cho rõ" — có thể là một tấm bằng thật chụp mờ.
    if (confidentWords > MAX_CARD_WORDS) documentKind = 'not_a_licence';
    else readable = passes.some((p) => p.anyDate) && documentNumber.value !== null;
  }
  const classList = classes.value ?? [];
  const keyVotes = [number, classes, expiry];
  // `B1` đổi nghĩa theo ngày cấp (ô tô ↔ mô tô ba bánh) — khi đó ngày cấp cũng là trường then chốt.
  if (classList.includes('B1')) keyVotes.push(issued);
  const confidence = keyVotes.reduce<ReadingConfidence>(
    (lowest, v) => (RANK[v.confidence] < RANK[lowest] ? v.confidence : lowest),
    'high',
  );

  const notes = [
    `Tesseract ${passes.length} lượt đọc`,
    context.rotation ? `ảnh đã xoay ${context.rotation}°` : null,
    isVn && !backSide
      ? `khớp giữa các lượt — số bằng ${number.agreement}, hạng ${classes.agreement}, hạn ${expiry.agreement}`
      : null,
    !isVn && documentKind !== 'not_a_licence'
      ? 'bằng quốc tế / nước ngoài — máy chỉ nhận dạng, chủ xe đối chiếu hạng và hạn trên bằng gốc khi giao xe'
      : null,
  ].filter(Boolean);

  const isLicence = documentKind !== 'not_a_licence';
  return {
    isDriverLicence: isLicence,
    documentKind,
    side: backSide
      ? 'back'
      : number.value || name.value || most('frontLabels') >= 2
        ? 'front'
        : 'unknown',
    readable,
    qualityIssues: context.qualityIssues,
    confidence: isVn ? confidence : 'low',
    // Ngoài GPLX Việt Nam, bố cục mỗi nơi một kiểu — số giấy tờ chỉ là thứ máy ĐOÁN được, để chủ xe
    // và người hỗ trợ đối chiếu; hạng/hạn không đọc (xem `decideFromReading`).
    licenceNumber: isVn ? number.value : isLicence ? documentNumber.value : null,
    // Không phải bằng lái (CCCD, hộ chiếu, ảnh linh tinh) thì không giữ một chữ nào đọc được trên đó.
    fullName: isLicence ? name.value : null,
    dateOfBirth: isVn ? dob.value : null,
    classes: isVn ? classList : [],
    issuedOn: isVn ? issued.value : null,
    expiresOn: isVn && expiry.value !== 'none' ? expiry.value : null,
    noExpiry: isVn && expiry.value === 'none',
    issuingCountry: isVn ? 'VN' : null,
    coversCar: false,
    coversMotorbike: false,
    notes: `${notes.join(' · ')}.`,
  };
}
