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
};

/** Nhãn của các ô KHÁC trên cà vẹt — chỉ để cắt giá trị, không đọc. */
const OTHER_LABELS: readonly Phrase[] = [
  ['NHANHIEU', 1],
  ['BRAND', 0],
  ['SOLOAI', 0],
  ['MODELCODE', 1],
  ['LOAIXE', 0],
  ['MAUSON', 0],
  ['COLOR', 0],
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

/** Mọi nhãn tìm thấy trên một dòng, theo thứ tự xuất hiện; mỗi trường giữ MỘT lần (xa nhất). */
function labelHits(line: PreparedLine): LabelHit[] {
  const hits: LabelHit[] = [];
  const consider = (field: Field | null, phrases: readonly Phrase[]) => {
    let best: LabelHit | null = null;
    for (const [text, maxEdits] of phrases) {
      if (line.key.length < text.length - maxEdits) continue;
      const found = approximateFind(line.key, text);
      if (found.distance > maxEdits) continue;
      const hit = { field, start: Math.max(0, found.end - text.length), end: found.end };
      if (!best || hit.end > best.end) best = hit;
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

/** Bỏ phần nhãn tiếng Anh còn sót "(Owner's full name):" và dấu câu đầu giá trị. */
function stripLead(text: string): string {
  let value = text.trim();
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
    hits.forEach((hit, i) => {
      if (!hit.field || out[hit.field]) return;
      const next = hits[i + 1];
      const from = rawAt(line, hit.end);
      const to = next ? rawAt(line, next.start) : line.raw.length;
      let value = stripLead(line.raw.slice(from, to));
      let confidence = spanConfidence(line, from, to);
      // Giá trị in xuống dòng dưới (mẫu thẻ) — chỉ khi dòng dưới không mở đầu bằng nhãn khác.
      const below = lines[index + 1];
      if (!value && below && (hitsOf[index + 1] ?? []).length === 0) {
        value = stripLead(below.raw);
        confidence = spanConfidence(below, 0, below.raw.length);
      }
      const parsed = value ? FIELD_PARSERS[hit.field](value) : null;
      if (parsed) out[hit.field] = { value: parsed, confidence };
    });
  });
  return out;
}

// ── Luật hình dạng từng trường ───────────────────────────────────────────────────────────────

const LIMITS = VEHICLE_REGISTRATION_LIMITS;

/** Số khung / số máy: mã chữ-số, có ít nhất một chữ số. Lấy cụm liền đầu tiên đủ dài. */
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
    if (code.length < min || code.length > max || !/\d/.test(code)) return null;
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
  const name = value
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (name.split(' ').length < 2 || name.length > LIMITS.holderNameMax) return null;
  return name;
}

function parseAddress(value: string): string | null {
  const address = value.replace(/\s+/g, ' ').trim();
  if (address.length < 5 || address.length > LIMITS.holderAddressMax) return null;
  return address;
}

/**
 * Biển số ô tô VN: 2 số tỉnh + 1–2 chữ seri + 4–5 số ("51H-100.00", "30A-1234"). Trả dạng in
 * chuẩn để chủ xe đọc quen mắt.
 */
function parsePlate(value: string): string | null {
  const match = /(\d{2})([A-Z]{1,2})(\d{4,5})/.exec(normalizePlateNumber(value));
  if (!match) return null;
  const [, province, series, digits] = match as unknown as [string, string, string, string];
  const tail = digits.length === 5 ? `${digits.slice(0, 3)}.${digits.slice(3)}` : digits;
  return `${province}${series}-${tail}`;
}

const FIELD_PARSERS: Readonly<Record<Field, (value: string) => string | null>> = {
  holderName: parseHolderName,
  holderAddress: parseAddress,
  engineNumber: parseCode(LIMITS.engineNumberMin, LIMITS.engineNumberMax),
  chassisNumber: parseChassis,
  plateNumber: parsePlate,
};

// ── Bỏ phiếu ───────────────────────────────────────────────────────────────────────────────────

/** Dưới mức này một lượt coi như không đọc được trường đó. */
const MIN_CONFIDENCE = 40;
/** Chỉ một lượt đọc ra mà Tesseract chấm từ mức này trở lên thì vẫn nhận. */
const SOLO_CONFIDENCE = 85;

/** So khớp hai giá trị của cùng một trường — bỏ khoảng trắng / dấu câu. */
const voteKey = (value: string) => normalizeRegistrationCode(value);

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
    return null;
  };
  return {
    plateNumber: pick('plateNumber'),
    holderName: pick('holderName'),
    holderAddress: pick('holderAddress'),
    chassisNumber: pick('chassisNumber'),
    engineNumber: pick('engineNumber'),
  };
}

/** Số nhãn cà vẹt thấy được trong một lượt — chọn chiều xoay ảnh đúng. */
export function registrationLabelScore(ocrLines: readonly OcrLine[]): number {
  return ocrLines
    .map(prepareLine)
    .reduce((sum, line) => sum + labelHits(line).filter((h) => h.field !== null).length, 0);
}
