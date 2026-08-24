import type { MoneyString } from '@xeprime/types';

export const CURRENCY_SUFFIX = '₫';

/**
 * Dấu phân tách theo ngôn ngữ — `vi-VN` dùng `.` cho nhóm và `,` cho thập phân, `en-US` ngược
 * lại. Suy ra từ `Intl` ở `useAppFormat`, KHÔNG gõ tay ở đây: file này không biết locale, nó
 * chỉ biết chèn ký tự vào đúng chỗ.
 */
export interface MoneySeparators {
  readonly group: string;
  readonly decimal: string;
}

/**
 * Format tiền để HIỂN THỊ, không parse sang `number` — ADR 0007.
 *
 * `Number('12345678901234.56')` mất chính xác; cộng nhiều khoản bằng float thì sai lệch
 * tích luỹ. Ở đây chỉ chèn dấu phân cách nhóm vào chuỗi, không đụng tới giá trị — nên đổi
 * ngôn ngữ chỉ đổi KÝ TỰ ngăn cách, con số vẫn nguyên vẹn từng chữ số một.
 *
 * `Intl.NumberFormat` cố ý KHÔNG dùng ở đây vì nó buộc phải nhận `number`.
 */
export function formatMoneyVnd(
  value: MoneyString | null | undefined,
  separators: MoneySeparators,
  emptyPlaceholder: string,
): string {
  if (value === null || value === undefined || value === '') {
    return emptyPlaceholder;
  }

  const [integerPart = '0', fractionPart] = value.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, separators.group);
  const hasFraction = Boolean(fractionPart) && Number(fractionPart) !== 0;

  return hasFraction
    ? `${grouped}${separators.decimal}${fractionPart} ${CURRENCY_SUFFIX}`
    : `${grouped} ${CURRENCY_SUFFIX}`;
}

/**
 * Quy một chuỗi tiền về **số nguyên đơn vị xu** dạng `bigint`.
 *
 * Cột tiền là `Decimal(14,2)` nên hai chữ số thập phân là đủ và không bao giờ mất chính xác —
 * khác hẳn `Number(value)`, thứ ADR 0007 cấm vì float làm sai lệch từ 2^53 trở lên.
 */
function toCents(value: MoneyString): bigint {
  const negative = value.trim().startsWith('-');
  const [integerPart = '0', fractionPart = ''] = value.trim().replace('-', '').split('.');
  const cents = BigInt(integerPart) * 100n + BigInt(fractionPart.padEnd(2, '0').slice(0, 2));
  return negative ? -cents : cents;
}

function fromCents(cents: bigint): MoneyString {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const fraction = absolute % 100n;
  const integer = absolute / 100n;
  const body = fraction === 0n ? `${integer}` : `${integer}.${String(fraction).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Hiệu hai số tiền, tính **hoàn toàn trên số nguyên** (`bigint` đơn vị xu).
 *
 * Lãi/lỗ = thu − chi là phép tính tiền thật sự, không phải ước lượng hiển thị: nó không được
 * đi qua `Number` (ADR 0007). Rỗng/null coi như 0 để một vế thiếu không nuốt cả kết quả.
 */
export function subtractMoney(
  minuend: MoneyString | null | undefined,
  subtrahend: MoneyString | null | undefined,
): MoneyString {
  return fromCents(toCents(minuend || '0') - toCents(subtrahend || '0'));
}

/** Số tiền có âm không — đọc trên chuỗi, cùng lý do như `isZeroMoney`. */
export function isNegativeMoney(value: MoneyString | null | undefined): boolean {
  return Boolean(value) && toCents(value as MoneyString) < 0n;
}

/**
 * Trị tuyệt đối của số tiền — dùng khi **nhãn đã mang dấu** ("Lỗ luỹ kế", "Còn nợ").
 * Hiện cả nhãn "Lỗ" lẫn dấu trừ là phủ định hai lần.
 */
export function absoluteMoney(value: MoneyString | null | undefined): MoneyString | null {
  if (value === null || value === undefined || value === '') return null;
  return fromCents(toCents(value) < 0n ? -toCents(value) : toCents(value));
}

/** Bậc rút gọn của một số tiền. Hậu tố là CHỮ nên nằm ở message, không nằm ở đây. */
export type MoneyCompactUnit = 'billion' | 'million' | 'thousand';

export interface CompactMoneyParts {
  /** Con số đã rút gọn, đã chèn dấu thập phân theo ngôn ngữ: `12,7` (vi) · `12.7` (en). */
  readonly value: string;
  readonly unit: MoneyCompactUnit;
}

/**
 * Rút gọn tiền cho chỗ HẸP (một dòng trên thẻ mobile): `12.750.000` → `12,7` + bậc `million`.
 *
 * Trả về PHẦN, không phải câu: hậu tố (`tr` / `M`) là chữ theo ngôn ngữ nên do message ghép.
 * `null` = số quá nhỏ để rút gọn ⇒ nơi gọi hiện dạng đầy đủ.
 *
 * Chỉ dùng khi bề rộng thật sự không chứa nổi con số đầy đủ — Figma `186:2417` là trường hợp
 * đó. Mọi chỗ còn lại dùng dạng đầy đủ vì rút gọn là **làm mất thông tin**.
 */
export function compactMoneyParts(
  value: MoneyString,
  separators: MoneySeparators,
): CompactMoneyParts | null {
  const cents = toCents(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const sign = negative ? '-' : '';

  // Ngưỡng theo cách người Việt đọc số tiền: nghìn → triệu → tỷ. Bậc en dùng cùng ngưỡng
  // (K/M/B trùng khớp 10^3/10^6/10^9), nên không có hai bảng ngưỡng để lệch nhau.
  const UNITS = [
    { scale: 100_000_000_000n, unit: 'billion' },
    { scale: 100_000_000n, unit: 'million' },
    { scale: 100_000n, unit: 'thousand' },
  ] as const;

  for (const { scale, unit } of UNITS) {
    if (absolute >= scale) {
      const whole = absolute / scale;
      const tenth = (absolute % scale) / (scale / 10n);
      const decimals = whole >= 100n || tenth === 0n ? '' : `${separators.decimal}${tenth}`;
      return { value: `${sign}${whole}${decimals}`, unit };
    }
  }

  return null;
}

/** Số tiền còn lại sau khi bỏ phần lẻ — dùng cho nhánh "quá nhỏ để rút gọn". */
export function wholeUnits(value: MoneyString): MoneyString {
  const cents = toCents(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}`;
}

/**
 * Số tiền có bằng 0 không, kiểm tra TRÊN CHUỖI — `Number(value) === 0` là đúng thứ ADR 0007
 * cấm (mất chính xác với số lớn). Dùng để quyết định tô đậm "còn nợ", ẩn dòng phí bằng 0…
 * Rỗng/null coi như 0.
 */
export function isZeroMoney(value: MoneyString | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true;
  return /^-?0*(\.0*)?$/.test(value.trim());
}

/**
 * Preview giá sau khuyến mãi ở client (thẻ xe/trang chi tiết/manage). PricingService
 * chốt báo giá bằng cùng công thức; helper này không dùng để cộng dồn kế toán.
 * Giá thuê VND là số nguyên ≤ 14 chữ số nên `Number` ở đây không mất chính xác (ADR 0007).
 */
export function applyDiscountPercent(
  value: MoneyString | null | undefined,
  percent: number | null | undefined,
): MoneyString | null {
  if (value == null || value === '') return null;
  if (!percent || percent <= 0 || percent > 100) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(Math.round((n * (100 - percent)) / 100));
}

/**
 * Số tiền ĐỌC BẰNG CHỮ tiếng Việt — "15950000" → "Mười lăm triệu chín trăm năm mươi nghìn đồng".
 *
 * Vì sao có: trên một ô nhập tiền, dòng chữ bên dưới là cách duy nhất người dùng bắt được lỗi
 * thừa/thiếu một số 0. `15.000.000` và `150.000.000` nhìn gần như nhau khi gõ vội; "mười lăm
 * triệu" và "một trăm năm mươi triệu" thì không.
 *
 * Cố ý là hàm THUẦN trên chuỗi (ADR 0007 — tiền không bao giờ đi qua `number`): `Number()` một số
 * 12 chữ số vẫn an toàn, nhưng để tiền chạm `number` ở một chỗ là mở đường cho chỗ thứ hai.
 *
 * Ba quy tắc chính tả tiếng Việt phải đúng, và cả ba đều là lỗi kinh điển khi tự viết:
 *  - hàng đơn vị **1** sau một chục ≥ 2 đọc là "mốt" (hai mươi **mốt**), không phải "một";
 *  - hàng đơn vị **5** sau một chục bất kỳ đọc là "lăm" (mười **lăm**), không phải "năm";
 *  - chục **1** đọc là "mười", chục **0** kèm đơn vị đọc là "lẻ" (một trăm **lẻ** năm).
 */
/** Hình dạng tiền hợp lệ trên dây (ADR 0007): số nguyên có dấu, tối đa 2 số lẻ. */
const MONEY_SHAPE = /^-?\d+(\.\d{1,2})?$/;

const VI_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
/** Lớp ba chữ số: nghìn → triệu → tỷ. Vượt quá tỷ thì lặp lại "tỷ" (nghìn tỷ = "nghìn tỷ"). */
const VI_SCALES = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];

/** Đọc một nhóm 3 chữ số. `full` = có nhóm lớn hơn đứng trước → luôn đọc đủ "không trăm". */
function readTriple(value: number, full: boolean): string {
  const hundred = Math.floor(value / 100);
  const ten = Math.floor((value % 100) / 10);
  const unit = value % 10;
  const parts: string[] = [];

  if (hundred > 0 || full) parts.push(`${VI_DIGITS[hundred]} trăm`);

  if (ten > 1) {
    parts.push(`${VI_DIGITS[ten]} mươi`);
    if (unit === 1) parts.push('mốt');
    else if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(VI_DIGITS[unit]!);
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(VI_DIGITS[unit]!);
  } else if (unit > 0) {
    // Chục bằng 0 mà có nhóm đứng trước → "lẻ" (một trăm lẻ năm).
    if (hundred > 0 || full) parts.push('lẻ');
    parts.push(VI_DIGITS[unit]!);
  }

  return parts.join(' ');
}

export function moneyToVietnameseWords(value: MoneyString | null | undefined): string {
  if (value == null || value === '') return '';
  // Chặn TRƯỚC khi gọi `wholeUnits`: nó dựng `BigInt` và ném với chuỗi không phải số. Ô nhập
  // tiền không sinh ra rác, nhưng hàm này còn được gọi trên dữ liệu từ API.
  if (!MONEY_SHAPE.test(value.trim())) return '';
  // Phần lẻ bị bỏ có chủ đích: tiền Việt không dùng hào, và mọi ô nhập tiền đều `precision={0}`.
  const digits = wholeUnits(value).replace(/^-/, '');
  if (!/^\d+$/.test(digits)) return '';
  if (/^0+$/.test(digits)) return 'Không đồng';

  // Cắt từ phải sang trái thành các nhóm 3 chữ số.
  const triples: number[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    triples.unshift(Number(digits.slice(Math.max(0, end - 3), end)));
  }
  if (triples.length > VI_SCALES.length) return '';

  const spoken = triples
    .map((triple, index) => {
      if (triple === 0) return '';
      const scale = VI_SCALES[triples.length - 1 - index] ?? '';
      return `${readTriple(triple, index > 0)}${scale}`;
    })
    .filter(Boolean)
    .join(' ');

  const negative = wholeUnits(value).startsWith('-') ? 'Âm ' : '';
  const text = `${negative}${spoken} đồng`.replace(/\s+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
