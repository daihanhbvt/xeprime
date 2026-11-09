import { CHAT_SIDE } from '@xeprime/types';
import {
  bookingPath,
  bookingRequestPath,
  listingPath,
  tripPath,
  vehiclePath,
} from '@/constants/routes';
import type { MessageTrip } from './types';

/** Tham số URL giữ hội thoại đang mở — chia sẻ được, sống sót F5, và nút Back hoạt động. */
export const CHAT_CONVERSATION_PARAM = 'c';
/** Xe người dùng vừa bấm "Nhắn shop" từ tin đăng — ngữ cảnh chờ gắn vào câu đầu tiên. */
export const CHAT_VEHICLE_PARAM = 'v';
/** Chuyến (id yêu cầu thuê) vừa bấm "Nhắn" từ chuyến đi / đơn thuê — cùng vai trò với `v`. */
export const CHAT_TRIP_PARAM = 't';

/**
 * Link mở MỘT hội thoại ở hộp thư `inbox` (`ROUTES.CHAT` hoặc `ROUTES.MANAGE.CHAT`), kèm ngữ cảnh
 * chờ gắn vào câu đầu tiên. Chuyến thắng xe: thẻ chuyến đã mang xe của chính chuyến đó.
 */
export function chatThreadHref(
  inbox: string,
  conversationId: string,
  context: { vehicleId?: string | null; tripId?: string | null } = {},
): string {
  const params = new URLSearchParams({ [CHAT_CONVERSATION_PARAM]: conversationId });
  if (context.tripId) params.set(CHAT_TRIP_PARAM, context.tripId);
  else if (context.vehicleId) params.set(CHAT_VEHICLE_PARAM, context.vehicleId);
  return `${inbox}?${params}`;
}

/**
 * Đích của thẻ XE — theo PHÍA người xem, vì hai phía ở hai site (ADR 0051 · 0053).
 *
 * Khách mở tin đăng trên chợ. Gian hàng / chủ xe mở chiếc xe CỦA HỌ trong site partner: server đã
 * kiểm xe thuộc gian hàng của hội thoại lúc gắn thẻ. Trỏ cả hai về `/listings/:id` là 404 ở
 * `partner.xeprime.vn` — site đó không có trang tin đăng.
 */
export function messageVehicleHref(viewerSide: string, vehicleId: string): string {
  return viewerSide === CHAT_SIDE.SHOP
    ? vehiclePath.detail(vehicleId)
    : listingPath.detail(vehicleId);
}

/**
 * Đích của thẻ CHUYẾN. Khách: trang chuyến đi (`/trips/:id` nhận id yêu cầu ở mọi chặng). Gian
 * hàng: trang chi tiết ĐƠN khi đã thành đơn; chưa thì màn "Đơn thuê xe" mở sẵn hộp chi tiết yêu cầu.
 */
export function messageTripHref(viewerSide: string, trip: MessageTrip): string {
  if (viewerSide !== CHAT_SIDE.SHOP) return tripPath.detail(trip.id);
  return trip.bookingId ? bookingPath.detail(trip.bookingId) : bookingRequestPath.open(trip.id);
}
