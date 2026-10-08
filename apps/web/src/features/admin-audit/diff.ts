/**
 * So sánh snapshot `beforeJson` / `afterJson` của một dòng nhật ký thành các hàng Trường · Trước ·
 * Sau. Thuần, không phụ thuộc React — panel chi tiết chỉ còn việc định dạng từng ô.
 */

export type AuditDiffKind = 'created' | 'removed' | 'updated' | 'none';

export interface AuditChange {
  /** Đường dẫn phẳng: `quota.maxVehicles`, `lines.0.amount`. */
  path: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

export interface AuditDiff {
  kind: AuditDiffKind;
  rows: AuditChange[];
}

/** Khoá dùng khi snapshot là một giá trị đơn (chuỗi/số) thay vì object. */
const SCALAR_KEY = 'value';

export function buildAuditDiff(before: unknown, after: unknown): AuditDiff {
  const hasBefore = before !== null && before !== undefined;
  const hasAfter = after !== null && after !== undefined;
  if (!hasBefore && !hasAfter) return { kind: 'none', rows: [] };

  const beforeMap = hasBefore ? flattenAuditJson(before) : new Map<string, unknown>();
  const afterMap = hasAfter ? flattenAuditJson(after) : new Map<string, unknown>();

  // Thứ tự: trường của bản TRƯỚC giữ nguyên thứ tự ghi, trường mới xuất hiện ở bản SAU nối đuôi.
  const paths = [...beforeMap.keys()];
  for (const path of afterMap.keys()) if (!beforeMap.has(path)) paths.push(path);

  const rows = paths.map((path) => {
    const b = beforeMap.get(path);
    const a = afterMap.get(path);
    return { path, before: b, after: a, changed: !sameValue(b, a) };
  });

  return { kind: !hasBefore ? 'created' : !hasAfter ? 'removed' : 'updated', rows };
}

/**
 * Làm phẳng một snapshot thành `đường dẫn → giá trị lá`.
 *
 * Object lồng nhau nối bằng dấu chấm. Mảng toàn giá trị đơn giữ nguyên làm MỘT lá (hiện dạng
 * "a, b, c"); mảng có object thì đánh chỉ số (`lines.0.amount`) để từng dòng tiền tự so sánh
 * được. Object rỗng vẫn là một lá, để "trước có {} sau có null" không biến mất khỏi bảng.
 */
export function flattenAuditJson(value: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (isPlainObject(value)) walk(value, '', out);
  else if (Array.isArray(value)) walk({ [SCALAR_KEY]: value }, '', out);
  else out.set(SCALAR_KEY, value);
  return out;
}

function walk(node: Record<string, unknown>, prefix: string, out: Map<string, unknown>): void {
  const entries = Object.entries(node);
  if (entries.length === 0 && prefix) {
    out.set(prefix, node);
    return;
  }
  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      walk(value, path, out);
    } else if (Array.isArray(value) && value.some(isPlainObject)) {
      walk(Object.fromEntries(value.map((item, index) => [String(index), item])), path, out);
    } else {
      out.set(path, value);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Mảng và object rỗng so bằng cấu trúc; `undefined` (thiếu) khác `null` (ghi rõ là trống). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
