/**
 * Thay đổi của một SỐ ĐẾM (đơn, chuyến, khách mới…) so với kỳ trước, bằng phần trăm nguyên.
 *
 * Bản cho TIỀN là `moneyChangePercent` ở `money.ts` — tách vì tiền đi trên dây bằng chuỗi và phải
 * tính bằng `bigint` (ADR 0007), còn số đếm là `number` an toàn.
 *
 * `null` khi kỳ trước bằng 0 hoặc một vế không hữu hạn: "từ 0 lên 3" không phải "+∞%", và hiện 0%
 * ở đó là nói sai. Cùng luật làm tròn nửa-xa-0 với bản tiền.
 */
export function countChangePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const ratio = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.sign(ratio) * Math.round(Math.abs(ratio));
  // −0,3% làm tròn ra `-0`, và `Intl.NumberFormat` in nó thành "-0%".
  return rounded === 0 ? 0 : rounded;
}
