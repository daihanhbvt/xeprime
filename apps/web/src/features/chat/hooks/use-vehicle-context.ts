'use client';

import { useListingDetail } from '@/features/marketplace/hooks/use-listing-detail';

export interface PendingVehicleContext {
  id: string;
  name: string;
  imageUrl: string | null;
}

/**
 * Xe mà người dùng vừa bấm "Nhắn shop" từ tin đăng của nó — ngữ cảnh đang CHỜ được gắn vào câu
 * nhắn đầu tiên.
 *
 * Vì sao phải hỏi lại server thay vì đọc từ hội thoại: hội thoại giờ thuộc về GIAN HÀNG, nên
 * `conversation.vehicleName` là "xe được nhắc gần nhất" — có thể là chiếc khác hẳn chiếc người
 * dùng đang xem. Và chỉ mang `?v=<id>` qua URL thì không có tên lẫn ảnh để vẽ thẻ.
 *
 * Dùng lại `useListingDetail` — đúng khoá cache của trang xe: người dùng vừa đứng ở trang xe đó,
 * nên trong phần lớn trường hợp dữ liệu đã nằm sẵn trong cache và không phát sinh request nào.
 * Hỏng thì chỉ mất cái thẻ, không mất khả năng nhắn tin.
 */
export function useVehicleContext(vehicleId: string | null): PendingVehicleContext | null {
  const { data } = useListingDetail(vehicleId);

  if (!vehicleId || !data) return null;
  return { id: vehicleId, name: data.name, imageUrl: data.mainImageUrl ?? null };
}
