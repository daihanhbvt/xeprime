/**
 * Khối "Bảo hiểm và giấy tờ" của màn duyệt xe / Xe trên sàn (đợt rà Admin 16/11/2026) — người duyệt
 * thấy giá trị xe khai so với giá trị tham khảo (ADR 0090), vì giá trị xe quyết định phí bảo hiểm vật
 * chất xe khách trả và mức bồi thường của hãng (ADR 0088).
 *
 * Chỉ CẢNH BÁO, không chặn duyệt: giá tham khảo là ước lượng, chủ xe vẫn là người quyết.
 */

/** Giá trị khai lệch giá tham khảo QUÁ ngần này phần trăm (cả cao lẫn thấp) thì cảnh báo người duyệt. */
export const INSURED_VALUE_DEVIATION_WARN_PERCENT = 20;

/**
 * % lệch của giá trị khai so với giá tham khảo, làm tròn 1 chữ số thập phân — dương = khai CAO hơn,
 * âm = khai THẤP hơn. `null` khi thiếu một trong hai hoặc giá tham khảo không dương.
 *
 * Tính trên chuỗi VND bằng BigInt (ADR 0007) — chỉ phép chia cuối mới ra số thập phân để hiển thị.
 */
export function insuredValueDeviationPercent(
  declared: string | null | undefined,
  reference: string | null | undefined,
): number | null {
  const d = wholeVnd(declared);
  const r = wholeVnd(reference);
  if (d == null || r == null || r <= 0n) return null;
  // Phần nghìn, rồi chia 10 — đủ chính xác cho một con số hiển thị, không qua `number` với tiền lớn.
  const permille = ((d - r) * 1000n) / r;
  return Number(permille) / 10;
}

/** Lệch có vượt ngưỡng cảnh báo không — một phép so cho cả API và web. */
export function insuredValueDeviationWarns(percent: number | null): boolean {
  return percent != null && Math.abs(percent) > INSURED_VALUE_DEVIATION_WARN_PERCENT;
}

/** Chuỗi tiền `123456` hoặc `123456.00` → BigInt đồng; khác dạng đó ⇒ `null`. */
function wholeVnd(value: string | null | undefined): bigint | null {
  if (!value) return null;
  const match = /^(\d{1,15})(?:\.\d+)?$/.exec(value.trim());
  return match ? BigInt(match[1]!) : null;
}
