/** Từ giá trị này trở lên mới làm tròn — dưới ngưỡng, sai lệch do làm tròn nói dối nhiều hơn là giúp đọc nhanh. */
const ROUND_FROM = 100;

/**
 * Làm tròn XUỐNG một số đếm lớn để hiển thị kiểu "1200+" thay vì "1234" — chỉ có ý nghĩa với số
 * liệu mang tính MINH CHỨNG QUY MÔ (số chuyến đã hoàn thành của một gian hàng), không dùng cho số
 * liệu cần chính xác.
 *
 * Làm tròn XUỐNG (không lên) để `approximate: true` không bao giờ nói nhiều hơn sự thật: "1200+"
 * đảm bảo gian hàng có ÍT NHẤT 1200 chuyến, còn làm tròn lên sẽ hứa một con số chưa chắc đã đạt.
 *
 * Bậc làm tròn theo độ lớn (chữ số có nghĩa thứ hai): 234 → 230, 1234 → 1200, 12345 → 12000 — con
 * số càng lớn thì càng làm tròn thô, đúng với cách người đọc thực sự xử lý số lớn.
 */
export function roundedCount(value: number): { display: number; approximate: boolean } {
  if (!Number.isFinite(value) || value < ROUND_FROM) {
    return { display: Math.max(0, Math.trunc(value)), approximate: false };
  }
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  const display = Math.floor(value / magnitude) * magnitude;
  return { display, approximate: display !== value };
}
