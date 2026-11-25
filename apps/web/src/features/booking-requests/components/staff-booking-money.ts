/**
 * Tổng tiền của đơn tự lập khi bật "Giá thoả thuận" (ADR 0109) — CHỈ để hiển thị trên màn Xem lại.
 * Cùng công thức với `bookingTotal` ở API (tiền thuê − giảm giá + phí giao xe + Σ phụ phí); số ghi vào
 * đơn do server tính lại. VND nguyên nên cộng số thường không mất độ chính xác.
 */
export function negotiatedTotal(input: {
  base: number | null | undefined;
  discount: number | null | undefined;
  delivery: number | null | undefined;
  extras: ReadonlyArray<{ amount?: number | null }> | null | undefined;
}): number {
  const extra = (input.extras ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return Math.max(0, (input.base ?? 0) - (input.discount ?? 0) + (input.delivery ?? 0) + extra);
}
