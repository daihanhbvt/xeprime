import { useQuery } from '@tanstack/react-query';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { marketplaceApi } from '@/features/marketplace/api';
import { tripsApi } from '@/features/trips/api';
import { queryKeys } from '@/queries/query-keys';

/**
 * Ngữ cảnh đang CHỜ được gắn vào câu nhắn đầu tiên: một chiếc XE (mở chat từ tin đăng) hoặc một
 * CHUYẾN (mở chat từ chuyến đi của khách / đơn thuê của gian hàng). `id` là id xe hoặc id YÊU CẦU.
 * Bản native của `PendingChatContext` bên web.
 */
export type PendingChatContext =
  | { kind: 'vehicle'; id: string; name: string; imageUrl: string | null }
  | {
      kind: 'trip';
      id: string;
      name: string;
      imageUrl: string | null;
      pickupAt: string | null;
      returnAt: string | null;
    };

/**
 * Xe mà người dùng vừa bấm "Nhắn shop" từ tin đăng của nó.
 *
 * Vì sao phải hỏi lại server thay vì đọc từ hội thoại: hội thoại thuộc về GIAN HÀNG, nên
 * `conversation.vehicleName` là "xe được nhắc gần nhất" — có thể là chiếc khác hẳn chiếc người
 * dùng đang xem. Và chỉ mang id qua route param thì không có tên lẫn ảnh để vẽ thẻ.
 *
 * Dùng lại `marketplaceApi.listing` + ĐÚNG query key của nó: người dùng vừa đứng ở trang xe đó,
 * nên trong phần lớn trường hợp dữ liệu đã nằm sẵn trong cache và không phát sinh request nào.
 */
export function useVehicleContext(vehicleId: string | null): PendingChatContext | null {
  const { data } = useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId ?? ''),
    queryFn: () => marketplaceApi.listing(vehicleId as string),
    enabled: Boolean(vehicleId),
    // Tin đăng không đổi trong lúc người ta gõ một câu — và hỏng thì chỉ mất cái thẻ, không mất
    // khả năng nhắn tin, nên không thử lại.
    retry: false,
  });

  if (!vehicleId || !data) return null;
  return { kind: 'vehicle', id: vehicleId, name: data.name, imageUrl: data.mainImageUrl ?? null };
}

/**
 * Chuyến mà người dùng vừa bấm "Nhắn" từ đó — đọc đúng nguồn của PHÍA người xem, cùng khoá cache
 * với màn họ vừa rời: khách đọc `/trips/:id`, gian hàng đọc `/booking-requests/:id`. Phía kia không
 * gọi được endpoint của phía này (khác realm), nên chỉ bật một trong hai truy vấn. Như web
 * `useTripContext`.
 */
export function useTripContext(side: ChatSide, tripId: string | null): PendingChatContext | null {
  const isShop = side === CHAT_SIDE.SHOP;
  const customerTrip = useQuery({
    queryKey: queryKeys.trips.detail(tripId ?? ''),
    queryFn: () => tripsApi.detail(tripId as string),
    enabled: !isShop && Boolean(tripId),
    retry: false,
  });
  const shopRequest = useQuery({
    queryKey: queryKeys.bookingRequests.detail(tripId ?? ''),
    queryFn: () => bookingRequestsApi.detail(tripId as string),
    enabled: isShop && Boolean(tripId),
    retry: false,
  });

  if (!tripId) return null;
  if (isShop) {
    const request = shopRequest.data;
    if (!request || request.id !== tripId) return null;
    return {
      kind: 'trip',
      id: tripId,
      name: request.vehicleName,
      imageUrl: request.vehicleImageUrl ?? null,
      pickupAt: request.pickupAt ?? null,
      returnAt: request.returnAt ?? null,
    };
  }
  const trip = customerTrip.data;
  if (!trip || trip.id !== tripId) return null;
  return {
    kind: 'trip',
    id: tripId,
    name: trip.vehicle.name,
    imageUrl: trip.vehicle.imageUrl ?? null,
    pickupAt: trip.pickupAt ?? null,
    returnAt: trip.returnAt ?? null,
  };
}
