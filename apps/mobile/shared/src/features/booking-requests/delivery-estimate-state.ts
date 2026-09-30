/** Ngưỡng độ dài địa chỉ trước khi hỏi API tra cứu — cùng con số với web. */
export const MIN_DELIVERY_ADDRESS_LENGTH = 12;

/**
 * Bốn phép kiểm quyết định khối "phí giao dự kiến" đang ở trạng thái nào.
 *
 * Tách ra hàm thuần vì chúng sai theo kiểu LỆCH MỘT NHỊP — thứ đọc code không thấy và chỉ lộ ra
 * khi gõ đúng một cách nhất định.
 */
export function deliveryEstimateState({
  typed,
  debounced,
  hasPin,
  fetching,
}: {
  /** Chữ khách ĐANG gõ, đã trim. */
  typed: string;
  /** Chữ đã qua debounce, đã trim — đúng chuỗi sắp đi lên dây. */
  debounced: string;
  /** Khách đã xác nhận một ghim trên bản đồ. */
  hasPin: boolean;
  fetching: boolean;
}) {
  /*
   * ĐO TRÊN CHUỖI ĐÃ DEBOUNCE. Đo trên `typed` là cái bẫy: dừng ở 11 ký tự cho debounce chốt,
   * rồi gõ ký tự thứ 12 — `typed` đủ 12 trong khi `debounced` vẫn là chuỗi 11, nên query bật và
   * gửi đi đúng chuỗi ngắn mà ngưỡng này sinh ra để chặn.
   */
  const queryable = hasPin || debounced.length >= MIN_DELIVERY_ADDRESS_LENGTH;
  /* Dùng cho GIAO DIỆN: hiện "đang tính" ngay khi gõ đủ chữ, không im lặng suốt quãng debounce. */
  const askable = hasPin || typed.length >= MIN_DELIVERY_ADDRESS_LENGTH;
  /* Kết quả trong tay có đúng là của địa chỉ đang hiển thị không. Ghim đổi khoá ngay ⇒ luôn chốt. */
  const settled = hasPin || typed === debounced;
  const current = askable && settled && !fetching;

  return { queryable, askable, settled, current };
}
