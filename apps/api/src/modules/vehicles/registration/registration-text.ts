import {
  VEHICLE_REGISTRATION_LIMITS,
  normalizePlateNumber,
  normalizeRegistrationCode,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import {
  approximateFind,
  prepareLine,
  spanConfidence,
  type OcrLine,
  type PreparedLine,
} from '../../driver-licences/reader/licence-text';

/**
 * Từ CHỮ Tesseract đọc trên ảnh cà vẹt ô tô ra các trường của giấy tờ `registration` — ADR 0089.
 *
 * Cà vẹt (mẫu xanh cũ và mẫu thẻ 2023) in nhãn song ngữ: "Tên chủ xe (Owner's full name)",
 * "Số máy (Engine N°)", "Số khung (Chassis N°)", "Biển số đăng ký (Number plate)". Cách đọc:
 *
 *  - tìm NHÃN bằng so khớp gần đúng trên chữ đã bỏ dấu (`prepareLine` của bộ đọc bằng lái) — chữ
 *    in nhỏ trên nền hoa văn hay bị đọc sai vài ký tự;
 *  - giá trị là đoạn chữ từ sau nhãn tới nhãn kế tiếp CÙNG dòng; trống thì lấy dòng dưới (cà vẹt
 *    thẻ in giá trị xuống dòng);
 *  - mỗi trường có luật hình dạng riêng (số khung là mã chữ-số 6–25 ký tự…); sai hình dạng ⇒ coi như
 *    không đọc được, KHÔNG đoán;
 *  - nhiều lượt đọc (mỗi lượt một cách xử lý ảnh) BỎ PHIẾU: chỉ giữ giá trị ≥ 2 lượt đọc giống nhau,
 *    hoặc một lượt mà Tesseract chấm rất cao. Trường không chắc để trống — chủ xe nhập tay.
 *
 * Thuần, không phụ thuộc Tesseract.
 */

type Field = keyof VehicleRegistrationReading;

/** Một nhãn: cách viết đã fold + bỏ khoảng trắng, kèm số lỗi đọc chấp nhận được. */
type Phrase = readonly [text: string, maxEdits: number];

/**
 * Nhãn của từng trường. Nhãn ngắn không cho sai ký tự nào (khớp nhầm vào chữ thường); nhãn tiếng
 * Anh đi sau nhãn tiếng Việt nên lấy điểm KẾT THÚC xa nhất để cắt trọn cả cặp.
 */
const LABELS: Readonly<Record<Field, readonly Phrase[]>> = {
  holderName: [
    ['TENCHUXE', 1],
    ['OWNERSFULLNAME', 2],
    ['OWNERSNAME', 2],
  ],
  holderAddress: [
    ['DIACHI', 0],
    ['ADDRESS', 1],
  ],
  engineNumber: [
    ['SOMAY', 0],
    ['ENGINENO', 1],
    ['ENGINEN', 1],
  ],
  chassisNumber: [
    ['SOKHUNG', 1],
    ['CHASSISNO', 1],
    ['CHASSISN', 1],
  ],
  plateNumber: [
    ['BIENSODANGKY', 2],
    ['NUMBERPLATE', 2],
    ['BIENSO', 0],
  ],
  color: [
    ['MAUSON', 0],
    ['COLOR', 0],
  ],
};

/** Nhãn của các ô KHÁC trên cà vẹt — chỉ để cắt giá trị, không đọc. */
const OTHER_LABELS: readonly Phrase[] = [
  ['NHANHIEU', 1],
  ['BRAND', 0],
  ['SOLOAI', 0],
  ['MODELCODE', 1],
  ['LOAIXE', 0],
  ['NAMSANXUAT', 1],
  ['SOCHONGOI', 1],
  ['DANGKYLANDAU', 2],
  ['COGIATRIDEN', 2],
  ['NGAYDANGKY', 1],
  ['DUNGTICH', 1],
];

interface LabelHit {
  field: Field | null;
  /** Vị trí trong `line.key`. */
  start: number;
  end: number;
}

/**
 * Mọi nhãn tìm thấy trên một dòng, theo thứ tự xuất hiện; mỗi trường giữ MỘT lần, phủ từ đầu nhãn
 * tiếng Việt tới cuối nhãn tiếng Anh ("Số máy (Engine N°)"). Lấy điểm đầu của nhãn tiếng Anh làm
 * đầu nhãn là để lọt "SỐ MÁ" vào giá trị của ô đứng trước (cà vẹt xe máy 2 cột, 18/11/2026).
 */
function labelHits(line: PreparedLine): LabelHit[] {
  const hits: LabelHit[] = [];
  const consider = (field: Field | null, phrases: readonly Phrase[]) => {
    let best: LabelHit | null = null;
    for (const [text, maxEdits] of phrases) {
      if (line.key.length < text.length - maxEdits) continue;
      const found = approximateFind(line.key, text);
      if (found.distance > maxEdits) continue;
      const start = Math.max(0, found.end - text.length);
      // Hai nhãn của cùng một ô phải liền nhau - nhãn rơi ở chỗ khác của dòng là trùng ngẫu nhiên.
      if (best && (start > best.end + 2 || found.end < best.start - 2)) {
        if (found.end > best.end) best = { field, start, end: found.end };
        continue;
      }
      best = best
        ? { field, start: Math.min(best.start, start), end: Math.max(best.end, found.end) }
        : { field, start, end: found.end };
    }
    if (best) hits.push(best);
  };
  for (const field of Object.keys(LABELS) as Field[]) consider(field, LABELS[field]);
  for (const phrase of OTHER_LABELS) consider(null, [phrase]);
  hits.sort((a, b) => a.start - b.start);
  // Nhãn chồng lên nhau ("BIENSODANGKY" chứa "BIENSO"): giữ nhãn đứng trước / dài hơn.
  return hits.filter((hit, i) => i === 0 || hit.start >= (hits[i - 1]?.end ?? 0));
}

/** Vị trí thô tương ứng vị trí `at` của khoá (hết khoá ⇒ cuối dòng). */
function rawAt(line: PreparedLine, at: number): number {
  return line.keyAt[at] ?? line.raw.length;
}

/**
 * Bỏ phần nhãn còn sót và dấu câu đầu giá trị. Ưu tiên DẤU HAI CHẤM: mọi mẫu cà vẹt in
 * "Nhãn (English):giá trị" - phần trước ":" gần nhãn là đuôi nhãn ("(Engine N°)"), dù OCR đọc méo
 * thế nào. Không có ":" mới dò theo ngoặc. Giá trị nằm ở dòng dưới thì dòng đó không có nhãn, tự
 * đi tiếp như thường (18/11/2026).
 */
function stripLead(text: string): string {
  let value = text.trim();
  const colon = value.search(/[:;]/);
  if (colon >= 0 && colon <= 30) return value.slice(colon + 1).replace(/^[\s:;.,)\-–|/]+/, '').trim();
  if (value.startsWith('(')) {
    const close = value.indexOf(')');
    if (close >= 0 && close < 40) value = value.slice(close + 1);
  } else {
    const close = value.indexOf(')');
    if (close >= 0 && close < 25 && !value.slice(0, close).includes('(')) {
      value = value.slice(close + 1);
    }
  }
  return value.replace(/^[\s:;.,)\-–|/]+/, '').trim();
}

interface Candidate {
  value: string;
  confidence: number;
}

/** Ứng viên thô của từng trường trong MỘT lượt đọc. */
export function analyseRegistrationPass(
  ocrLines: readonly OcrLine[],
): Partial<Record<Field, Candidate>> {
  const lines = ocrLines.map(prepareLine);
  const hitsOf = lines.map(labelHits);
  const out: Partial<Record<Field, Candidate>> = {};

  lines.forEach((line, index) => {
    const hits = hitsOf[index] ?? [];
    const valueOf = (i: number) => {
      const hit = hits[i]!;
      const next = hits[i + 1];
      const from = rawAt(line, hit.end);
      const to = next ? rawAt(line, next.start) : line.raw.length;
      return { from, to, value: stripLead(line.raw.slice(from, to)) };
    };
    // Ô có nhãn mà giá trị in ở dòng dưới. Cà vẹt mẫu cũ in HAI cột ("Tên chủ xe … Số máy" chung
    // một dòng, hai giá trị chung dòng dưới) ⇒ ô bên phải lấy cụm CUỐI của dòng dưới (mã một cụm),
    // ô bên trái lấy phần còn lại.
    // "Trống" = không có giá trị HỢP LỆ ngay sau nhãn - rác đọc nhầm từ nhãn tiếng Anh ("Engine NI:
    // NHI") không được chặn việc lấy giá trị ở dòng dưới.
    const usable = (i: number) => {
      const field = hits[i]?.field;
      const value = valueOf(i).value;
      return Boolean(field && value && FIELD_PARSERS[field](value));
    };
    const emptyFields = hits
      .map((hit, i) => (hit.field && !usable(i) ? i : -1))
      .filter((i) => i >= 0);
    hits.forEach((hit, i) => {
      if (!hit.field || out[hit.field]) return;
      const { from, to, value: inline } = valueOf(i);
      let value = inline;
      let confidence = spanConfidence(line, from, to);
      // Giá trị in xuống dòng dưới (mẫu thẻ) — chỉ khi dòng dưới không mở đầu bằng nhãn khác.
      const below = lines[index + 1];
      if (!usable(i) && below && (hitsOf[index + 1] ?? []).length === 0) {
        const raw = below.raw.trimEnd();
        const cut = raw.search(/\S+$/);
        // Cột phải là MÃ một cụm - cụm cuối không giống mã thì không coi là hai cột.
        const tail = normalizeRegistrationCode(raw.slice(Math.max(cut, 0)));
        const twoColumns = emptyFields.length >= 2 && cut > 0 && looksLikeCode(tail);
        const isRight = emptyFields.length >= 2 && i === emptyFields[emptyFields.length - 1];
        // Hai cột mà cụm cuối không ra mã: ô bên phải để trống (không nhận cả dòng của ô trái).
        if (isRight && !twoColumns) return;
        const [a, b] = !twoColumns ? [0, raw.length] : isRight ? [cut, raw.length] : [0, cut];
        value = stripLead(raw.slice(a, b));
        confidence = spanConfidence(below, a, b);
        // Dòng dưới chỉ là đuôi nhãn ("(N° plate)") ⇒ giá trị nằm thêm một dòng nữa.
        const further = lines[index + 2];
        if (!value && !twoColumns && further && (hitsOf[index + 2] ?? []).length === 0) {
          value = stripLead(further.raw);
          confidence = spanConfidence(further, 0, further.raw.length);
        }
      }
      const parsed = value ? FIELD_PARSERS[hit.field](value) : null;
      if (parsed) out[hit.field] = { value: parsed, confidence };
    });
  });
  return out;
}

// ── Luật hình dạng từng trường ───────────────────────────────────────────────────────────────

const LIMITS = VEHICLE_REGISTRATION_LIMITS;

/**
 * Mã số khung / số máy thật luôn trộn chữ + số và có nhiều chữ số ("JF74E0055734", "7318KY014278",
 * VIN). Rác OCR đọc từ nhãn ("CHAUISN92") hay năm sinh in cạnh tên chủ xe ("1992") thì không - loại
 * ngay ở đây, chủ xe tự nhập (18/11/2026). Luật này chỉ cho MÁY ĐỌC; ô nhập tay vẫn theo LIMITS.
 */
function looksLikeCode(code: string): boolean {
  const digits = code.replace(/\D/g, '').length;
  return digits >= 4 && /[A-Z]/.test(code);
}

/** Số khung / số máy: mã chữ-số. Lấy cụm liền đầu tiên đủ dài. */
function parseCode(min: number, max: number) {
  return (value: string): string | null => {
    const tokens = value.split(/\s+/).map(normalizeRegistrationCode).filter(Boolean);
    // Mã in (hoặc bị đọc) tách thành nhiều cụm — đoạn giá trị đã cắt trước nhãn kế tiếp nên ghép
    // cả đoạn; dài quá trần (dính chữ rác) thì chỉ ghép dần tới đủ độ dài tối thiểu.
    let code = tokens.join('');
    if (code.length > max) {
      code = '';
      for (const token of tokens) {
        code += token;
        if (code.length >= min) break;
      }
    }
    if (code.length < min || code.length > max || !looksLikeCode(code)) return null;
    return code;
  };
}

/** VIN 17 ký tự không dùng I/O/Q — máy đọc nhầm số 1/0 thành chữ thì sửa về số. */
function parseChassis(value: string): string | null {
  const code = parseCode(LIMITS.chassisNumberMin, LIMITS.chassisNumberMax)(value);
  if (!code) return null;
  return code.length === 17 ? code.replace(/[OQ]/g, '0').replace(/I/g, '1') : code;
}

/** Tên chủ xe: chỉ chữ (có dấu) + khoảng trắng, ít nhất hai từ, viết hoa như in trên cà vẹt. */
function parseHolderName(value: string): string | null {
  let tokens = value
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // Tên in HOA trên cà vẹt; cụm chữ THƯỜNG dính ở hai đầu là rác máy đọc từ hoa văn/con dấu ("PHAN
  // NGỌC TRANG su"). Bỏ chúng để các lượt đọc khớp nhau (18/11/2026).
  const upper = (word: string) => word === word.toUpperCase() && word !== word.toLowerCase();
  if (tokens.filter(upper).length >= 2) {
    while (tokens.length && !upper(tokens[0]!)) tokens = tokens.slice(1);
    while (tokens.length && !upper(tokens[tokens.length - 1]!)) tokens = tokens.slice(0, -1);
  }
  const name = tokens.join(' ').toUpperCase();
  // Rác đọc từ đuôi nhãn tiếng Anh ("(Owner's full name): a s") cũng ra "hai từ" - tên thật có ít
  // nhất hai từ từ 2 chữ cái và đủ dài. Không đạt ⇒ coi như trống để lấy dòng DƯỚI nhãn (18/11/2026).
  const words = name.split(' ');
  const realWords = words.filter((word) => word.length >= 2).length;
  if (realWords < 2 || name.replace(/\s/g, '').length < 5 || name.length > LIMITS.holderNameMax) {
    return null;
  }
  return name;
}

/** Màu dài nhất còn tin được — tên màu ghép hai màu ("Xanh dương - Trắng") vẫn dưới mức này. */
const COLOR_MAX = 30;

/**
 * Màu sơn ("Trắng", "Đỏ - Đen"): chỉ chữ cái, khoảng trắng, gạch nối; viết hoa chữ đầu. Có chữ số
 * hay quá dài là máy đọc lẫn ô bên cạnh ⇒ không đoán (ADR 0102).
 */
function parseColor(value: string): string | null {
  const text = value
    .replace(/[^\p{L}\s-]/gu, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .toLowerCase();
  if (/\d/.test(value) || text.replace(/[\s-]/g, '').length < 2 || text.length > COLOR_MAX) {
    return null;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseAddress(value: string): string | null {
  const address = value.replace(/\s+/g, ' ').trim();
  if (address.length < 5 || address.length > LIMITS.holderAddressMax) return null;
  return address;
}

/**
 * Biển số VN, ô tô lẫn xe máy (cà vẹt xe máy đọc từ 17/11/2026):
 *  - ô tô: 2 số tỉnh + 1–2 chữ seri + 4–5 số ("51H-100.00", "30A-1234");
 *  - xe máy: 2 số tỉnh + chữ seri + MỘT chữ số + 4–5 số ("59X1-123.45"), hoặc seri hai chữ ("29AA-123.45").
 *
 * Sáu chữ số liền sau chữ seri chỉ có thể là xe máy (chữ số đầu thuộc seri). Năm chữ số thì hai
 * cách tách đều có thể — in theo kiểu ô tô; phép so với biển của xe chuẩn hoá bỏ mọi dấu nên kết
 * quả so khớp không phụ thuộc cách tách. Trả dạng in chuẩn để chủ xe đọc quen mắt.
 */
function parsePlate(value: string): string | null {
  const match = /(\d{2})([A-Z]{1,2})(\d{4,6})/.exec(normalizePlateNumber(value));
  if (!match) return null;
  const [, province, letters, rawDigits] = match as unknown as [string, string, string, string];
  // Mã tỉnh trên biển VN bắt đầu từ 11 - "09X1…" là OCR đọc thừa/thiếu số, không đoán.
  if (Number(province) < 11) return null;
  const series = rawDigits.length === 6 ? `${letters}${rawDigits[0]}` : letters;
  const digits = rawDigits.length === 6 ? rawDigits.slice(1) : rawDigits;
  const tail = digits.length === 5 ? `${digits.slice(0, 3)}.${digits.slice(3)}` : digits;
  return `${province}${series}-${tail}`;
}

const FIELD_PARSERS: Readonly<Record<Field, (value: string) => string | null>> = {
  holderName: parseHolderName,
  holderAddress: parseAddress,
  engineNumber: parseCode(LIMITS.engineNumberMin, LIMITS.engineNumberMax),
  chassisNumber: parseChassis,
  plateNumber: parsePlate,
  color: parseColor,
};

// ── Bỏ phiếu ───────────────────────────────────────────────────────────────────────────────────

/** Dưới mức này một lượt coi như không đọc được trường đó. */
const MIN_CONFIDENCE = 40;
/** Chỉ một lượt đọc ra mà Tesseract chấm từ mức này trở lên thì vẫn nhận. */
const SOLO_CONFIDENCE = 85;

/** So khớp hai giá trị của cùng một trường — bỏ khoảng trắng / dấu câu. */
const voteKey = (value: string) => normalizeRegistrationCode(value);

/** Số khung / số máy: mã dài, OCR hay thêm/bớt MỘT ký tự giữa các lượt ("VUMHAYG…" ↔ "VUMHAYGI…"). */
const CODE_FIELDS: ReadonlySet<Field> = new Set<Field>(['chassisNumber', 'engineNumber']);

/** Khoảng cách sửa chữ (Levenshtein) - mã ngắn (< 25 ký tự) nên O(n·m) không đáng kể. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/**
 * Đồng thuận GẦN cho mã dài (18/11/2026): các lượt chỉ THÊM/BỚT ≤ 1 ký tự (mã ≥ 10 ký tự: ≤ 2)
 * coi như cùng đọc một mã; nhóm phải có ≥ 2 lượt và nhiều hơn phần còn lại, rồi lấy bản Tesseract chấm
 * cao nhất trong nhóm. Không có nhóm như vậy ⇒ `null` - vẫn không đoán.
 */
function nearConsensus(present: readonly Candidate[]): string | null {
  const key = (c: Candidate) => voteKey(c.value);
  let best: Candidate[] = [];
  for (const anchor of present) {
    const limit = key(anchor).length >= 10 ? 2 : 1;
    // CHỈ lệch kiểu thêm/bớt ký tự (khoảng cách = chênh độ dài). Lệch kiểu THAY ký tự ("7"↔"T",
    // "V"↔"Y") thì không biết bản nào đúng - đo trên bộ mẫu: đoán ở đó là điền sai.
    const group = present.filter((c) => {
      const d = editDistance(key(anchor), key(c));
      return d <= limit && d === Math.abs(key(anchor).length - key(c).length);
    });
    if (group.length > best.length) best = group;
  }
  if (best.length < 2 || best.length <= present.length - best.length) return null;
  return best.reduce((a, b) => (b.confidence > a.confidence ? b : a)).value;
}

/** Trong các phương án hoà phiếu, lấy phương án của lượt đọc Tesseract chấm cao nhất. */
function majority<T>(options: readonly { value: T; confidence: number }[]): T {
  const tally = new Map<T, { count: number; confidence: number }>();
  for (const o of options) {
    const cur = tally.get(o.value) ?? { count: 0, confidence: 0 };
    tally.set(o.value, { count: cur.count + 1, confidence: Math.max(cur.confidence, o.confidence) });
  }
  return [...tally.entries()].sort(
    (a, b) => b[1].count - a[1].count || b[1].confidence - a[1].confidence,
  )[0]![0];
}

/**
 * ĐOÁN TỐT NHẤT khi các lượt đọc không khớp nhau hoàn toàn (18/11/2026). Ảnh cà vẹt giờ chỉ để
 * ĐIỀN NHANH - ô điền sẵn bị khoá kèm bút sửa, người dùng đối chiếu với ảnh trước khi gửi - nên một
 * giá trị gần đúng có ích hơn ô trống. Mã: thống nhất độ dài theo số đông (lượt dư 1-2 ký tự thì bỏ
 * ký tự lệch nhất), rồi bỏ phiếu TỪNG KÝ TỰ. Tên: bỏ phiếu TỪNG CHỮ, cắt chữ rác dư ở cuối.
 */
function bestGuess(field: Field, present: readonly Candidate[]): string | null {
  if (present.length < 2) return null;
  const byConfidence = [...present].sort((a, b) => b.confidence - a.confidence);
  if (CODE_FIELDS.has(field)) {
    const codes = byConfidence.map((c) => ({ value: voteKey(c.value), confidence: c.confidence }));
    const length = majority(codes.map((c) => ({ value: c.value.length, confidence: c.confidence })));
    const anchor = codes.find((c) => c.value.length === length)!.value;
    const aligned = codes.flatMap((c) => {
      if (c.value.length === length) return [c];
      if (c.value.length < length || c.value.length > length + 2) return [];
      // Bỏ ký tự dư sao cho giống mã mốc nhất.
      let best = c.value.slice(0, length);
      let bestDiff = Infinity;
      const extra = c.value.length - length;
      for (let i = 0; i <= c.value.length - extra; i += 1) {
        const cut = c.value.slice(0, i) + c.value.slice(i + extra);
        let diff = 0;
        for (let k = 0; k < length; k += 1) if (cut[k] !== anchor[k]) diff += 1;
        if (diff < bestDiff) [best, bestDiff] = [cut, diff];
      }
      return [{ value: best, confidence: c.confidence }];
    });
    if (aligned.length < 2) return null;
    let out = '';
    for (let k = 0; k < length; k += 1) {
      out += majority(aligned.map((c) => ({ value: c.value[k]!, confidence: c.confidence })));
    }
    return out;
  }
  if (field === 'holderName') {
    const names = byConfidence.map((c) => {
      const words = c.value.split(' ');
      // Rác cạnh tên thường là 1-2 ký tự ("EU", "O") - bỏ ở cuối, vẫn giữ tối thiểu hai chữ.
      while (words.length > 2 && words[words.length - 1]!.length <= 2) words.pop();
      return { words, confidence: c.confidence };
    });
    const count = majority(names.map((n) => ({ value: n.words.length, confidence: n.confidence })));
    // Lượt dư chữ ở CUỐI (rác cạnh tên) thì cắt về đúng số chữ; lượt thiếu chữ thì không bỏ phiếu.
    const aligned = names
      .filter((n) => n.words.length >= count)
      .map((n) => ({ words: n.words.slice(0, count), confidence: n.confidence }));
    if (aligned.length < 2) return null;
    return Array.from({ length: count }, (_, k) =>
      majority(aligned.map((n) => ({ value: n.words[k]!, confidence: n.confidence }))),
    ).join(' ');
  }
  return null;
}

/**
 * Gộp các lượt đọc. Trường chỉ có giá trị khi ≥ 2 lượt đọc giống nhau và nhiều hơn phần lệch, hoặc
 * duy nhất một lượt đọc được với điểm rất cao. Không chắc ⇒ `null` (chủ xe nhập tay).
 */
export function mergeRegistrationPasses(
  passes: readonly Partial<Record<Field, Candidate>>[],
): VehicleRegistrationReading {
  const pick = (field: Field): string | null => {
    const present = passes
      .map((pass) => pass[field])
      .filter((c): c is Candidate => !!c && c.confidence >= MIN_CONFIDENCE);
    if (present.length === 0) return null;
    const groups = new Map<string, Candidate[]>();
    for (const c of present)
      groups.set(voteKey(c.value), [...(groups.get(voteKey(c.value)) ?? []), c]);
    const ranked = [...groups.values()].sort(
      (a, b) =>
        b.length - a.length ||
        Math.max(...b.map((c) => c.confidence)) - Math.max(...a.map((c) => c.confidence)),
    );
    const winner = ranked[0] ?? [];
    const best = winner.reduce((a, b) => (b.confidence > a.confidence ? b : a), winner[0]!);
    const dissent = present.length - winner.length;
    if (winner.length >= 2 && winner.length > dissent) return best.value;
    if (present.length === 1 && best.confidence >= SOLO_CONFIDENCE) return best.value;
    if (CODE_FIELDS.has(field)) return nearConsensus(present) ?? bestGuess(field, present);
    return bestGuess(field, present);
  };
  return {
    plateNumber: pick('plateNumber'),
    holderName: pick('holderName'),
    holderAddress: pick('holderAddress'),
    chassisNumber: pick('chassisNumber'),
    engineNumber: pick('engineNumber'),
    color: pick('color'),
  };
}

/** Số nhãn cà vẹt thấy được trong một lượt — chọn chiều xoay ảnh đúng. */
export function registrationLabelScore(ocrLines: readonly OcrLine[]): number {
  return ocrLines
    .map(prepareLine)
    .reduce((sum, line) => sum + labelHits(line).filter((h) => h.field !== null).length, 0);
}
