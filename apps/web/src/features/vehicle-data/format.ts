/** Tên một xe chuẩn: "Hãng Dòng xe Phiên bản" (phiên bản trống thì bỏ). Tên riêng — không dịch. */
export function vehicleDataTitle(row: {
  brandLabel: string;
  modelLabel: string;
  variantLabel: string;
}): string {
  return [row.brandLabel, row.modelLabel, row.variantLabel].filter((v) => v.trim()).join(' ');
}

/** % chênh của giá thực tế so với giá tham khảo (làm tròn), null khi thiếu một bên. */
export function marketDiffPercent(reference: string | null, actual: string | null): number | null {
  if (!reference || !actual) return null;
  const ref = Number(reference);
  const real = Number(actual);
  if (!(ref > 0) || !(real > 0)) return null;
  return Math.round(((real - ref) / ref) * 100);
}

/** Chênh từ mức này trở lên thì danh sách tô màu nhắc vận hành xem lại giá tham khảo. */
export const MARKET_DIFF_ALERT_PERCENT = 15;
