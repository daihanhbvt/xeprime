import { MIN_DELIVERY_ADDRESS_LENGTH } from '@xeprime/types';

// Ngưỡng độ dài + debounce dùng chung với web (`@xeprime/types`).
export { DELIVERY_ADDRESS_DEBOUNCE_MS, MIN_DELIVERY_ADDRESS_LENGTH } from '@xeprime/types';

/**
 * Bốn phép kiểm quyết định khối "phí giao dự kiến" đang ở trạng thái nào — port nguyên phép của
 * web (`RequestBookingFlow`, khối "Quãng đường giao xe + phí dự kiến").
 *
 * Chỉ hỏi cho địa chỉ ĐÃ XÁC NHẬN: có ghim/toạ độ, hoặc địa chỉ gõ tay khách đã chủ động chốt
 * (`locationSource = manual`). Chữ đang gõ dở thì KHÔNG: tra một dòng chữ là hai giao dịch Vietmap
 * có tính tiền (ADR 0061) cho một chỗ khách chưa chọn.
 *
 * Tách ra hàm thuần vì chúng sai theo kiểu LỆCH MỘT NHỊP — thứ đọc code không thấy và chỉ lộ ra
 * khi gõ đúng một cách nhất định.
 */
export function deliveryEstimateState({
  typed,
  debounced,
  hasPin,
  manual,
  fetching,
}: {
  /** Chữ khách ĐANG gõ, đã trim. */
  typed: string;
  /** Chữ đã qua debounce, đã trim — đúng chuỗi sắp đi lên dây. */
  debounced: string;
  /** Khách đã xác nhận một ghim / gợi ý có toạ độ. */
  hasPin: boolean;
  /** `deliveryLocationSource === LOCATION_SOURCE.MANUAL` — địa chỉ gõ tay đã chốt. */
  manual: boolean;
  fetching: boolean;
}) {
  /* Kết quả trong tay có đúng là của địa chỉ đang hiển thị không. Ghim đổi khoá ngay ⇒ luôn chốt. */
  const settled = hasPin || typed === debounced;
  /*
   * ĐO TRÊN CHUỖI ĐÃ DEBOUNCE và gác bằng `settled`. Nguồn `manual` đổi NGAY (blur trả ô về địa
   * chỉ đã chốt, hay bấm "dùng đúng địa chỉ đã nhập") trong khi chuỗi debounce còn là chữ vừa gõ
   * dở; đo trên `typed` thì query bật và gửi đi đúng chuỗi chưa ai xác nhận.
   */
  const queryable =
    hasPin || (manual && settled && debounced.length >= MIN_DELIVERY_ADDRESS_LENGTH);
  /* Dùng cho GIAO DIỆN: "đang tính" chỉ khi thật sự có thứ để hỏi. */
  const askable = hasPin || (manual && typed.length >= MIN_DELIVERY_ADDRESS_LENGTH);
  const current = askable && settled && !fetching;

  return { queryable, askable, settled, current };
}
