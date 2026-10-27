import { STOREFRONT_KIND } from '@xeprime/types';

/**
 * Nút "Nhắn tin cho chủ xe" ở "Chuyến của tôi" (bề mặt khách) hiện hay ẩn.
 *
 *  - GIAN HÀNG (tuyến gói): mọi chặng của chuyến.
 *  - CHỦ XE cá nhân (tuyến hoa hồng): chỉ khi chuyến ĐÃ CÓ ĐƠN — tức tiền giữ chỗ đã thanh toán
 *    thành công (đơn thuê chỉ ra đời ở lượt đối soát đủ tiền, ADR 0044). Trước đó khách liên hệ qua
 *    chính luồng yêu cầu, không mở kênh riêng với chủ xe (ADR 0028 điều 9 · ADR 0073).
 *
 * Đây là quy tắc HIỂN THỊ của màn chuyến — cùng luật `chatOpenBetween` mà server gác ở
 * `ChatService` (mở hội thoại, gửi tin). Web và app dùng chung để hai bề mặt không lệch nhau.
 */
export function canShowHostChatOnTrip(input: {
  shopKind: string | null | undefined;
  hasBooking: boolean;
}): boolean {
  return input.shopKind === STOREFRONT_KIND.SHOP || input.hasBooking;
}
