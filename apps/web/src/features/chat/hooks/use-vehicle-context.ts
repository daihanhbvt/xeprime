'use client';

import { useQuery } from '@tanstack/react-query';
import { CHAT_SIDE } from '@xeprime/types';
import { fetchBookingRequest } from '@/features/booking-requests/api';
import { useListingDetail } from '@/features/marketplace/hooks/use-listing-detail';
import { fetchTrip } from '@/features/trips/api';
import { queryKeys } from '@/services/query-keys';

/**
 * Ngữ cảnh đang CHỜ được gắn vào câu nhắn đầu tiên: một chiếc XE (mở chat từ tin đăng) hoặc một
 * CHUYẾN (mở chat từ chuyến đi của khách / đơn thuê của gian hàng). `id` là id xe hoặc id YÊU CẦU.
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
 * Vì sao phải hỏi lại server thay vì đọc từ hội thoại: hội thoại giờ thuộc về GIAN HÀNG, nên
 * `conversation.vehicleName` là "xe được nhắc gần nhất" — có thể là chiếc khác hẳn chiếc người
 * dùng đang xem. Và chỉ mang `?v=<id>` qua URL thì không có tên lẫn ảnh để vẽ thẻ.
 *
 * Dùng lại `useListingDetail` — đúng khoá cache của trang xe: người dùng vừa đứng ở trang xe đó,
 * nên trong phần lớn trường hợp dữ liệu đã nằm sẵn trong cache và không phát sinh request nào.
 * Hỏng thì chỉ mất cái thẻ, không mất khả năng nhắn tin.
 */
export function useVehicleContext(vehicleId: string | null): PendingChatContext | null {
  const { data } = useListingDetail(vehicleId);

  if (!vehicleId || !data) return null;
  return { kind: 'vehicle', id: vehicleId, name: data.name, imageUrl: data.mainImageUrl ?? null };
}

/**
 * Chuyến mà người dùng vừa bấm "Nhắn" từ đó — đọc đúng nguồn của PHÍA người xem, cùng khoá cache
 * với màn họ vừa rời: khách đọc `/trips/:id`, gian hàng đọc `/booking-requests/:id`. Phía kia không
 * gọi được endpoint của phía này (khác realm), nên chỉ bật một trong hai truy vấn.
 */
export function useTripContext(side: string, tripId: string | null): PendingChatContext | null {
  const isShop = side === CHAT_SIDE.SHOP;
  // Không qua `useTrip`: hook đó tự poll khi chuyến chờ thanh toán — cái chip chỉ cần tên + lịch.
  const customerTrip = useQuery({
    queryKey: queryKeys.trips.detail(tripId ?? ''),
    queryFn: () => fetchTrip(tripId as string),
    enabled: !isShop && Boolean(tripId),
  });
  const shopRequest = useQuery({
    queryKey: queryKeys.bookingRequests.detail(tripId ?? ''),
    queryFn: () => fetchBookingRequest(tripId as string),
    enabled: isShop && Boolean(tripId),
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
