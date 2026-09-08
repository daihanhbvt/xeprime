'use client';

import { useQuery } from '@tanstack/react-query';
import { marketplaceApi } from '@xeprime/api-client';
import { queryKeys } from '@/services/query-keys';

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
 * Dùng lại `marketplaceApi.listing` + đúng query key của nó: người dùng vừa đứng ở trang xe đó,
 * nên trong phần lớn trường hợp dữ liệu đã nằm sẵn trong cache và không phát sinh request nào.
 */
export function useVehicleContext(vehicleId: string | null): PendingVehicleContext | null {
  const { data } = useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId ?? ''),
    queryFn: () => marketplaceApi.listing(vehicleId as string),
    enabled: Boolean(vehicleId),
    // Tin đăng không đổi trong lúc người ta gõ một câu — và hỏng thì chỉ mất cái thẻ, không mất
    // khả năng nhắn tin, nên không thử lại.
    retry: false,
  });

  if (!vehicleId || !data) return null;
  return { id: vehicleId, name: data.name, imageUrl: data.mainImageUrl ?? null };
}
