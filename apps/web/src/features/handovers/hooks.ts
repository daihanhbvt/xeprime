'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryParams } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { HandoverType } from '@xeprime/types';
import { fetchHandoverContext, fetchHandoverPhotoUrl, fetchMissingOdometerQueue } from './api';
import type { HandoverPhoto } from './types';

/**
 * Ngữ cảnh bàn giao của một đơn. `enabled` tắt khi thiếu `handovers.view` — không gọi API
 * chỉ để nhận 403.
 */
export function useHandoverContext(bookingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.handovers(bookingId ?? ''),
    queryFn: () => fetchHandoverContext(bookingId!),
    enabled: Boolean(bookingId) && enabled,
    retry: false, // 403/404 là câu trả lời, không phải lỗi tạm
  });
}

/** Hàng đợi "Thiếu KM trả" toàn gian hàng — nhóm việc của Trung tâm bảo dưỡng (Wave 8). */
export function useMissingOdometerQueue(params: QueryParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.maintenance.missingReturnKm(params),
    queryFn: () => fetchMissingOdometerQueue(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Sau mỗi thao tác bàn giao: làm mới đơn (trạng thái vừa đổi), lịch (chỗ vừa nhả), cụm
 * bảo dưỡng/KM của xe (số KM vừa nhảy) VÀ mọi bề mặt của xe (Wave 8: thẻ ở danh sách và
 * Hồ sơ 360 đều hiện cảnh báo/KM lấy từ cùng dữ liệu đó).
 *
 * Tất cả đổi trong MỘT transaction ở backend, nên ở client chúng cũng phải cùng được làm mới —
 * để sót một nhánh là để lại một màn hình kể chuyện cũ.
 */
export function useInvalidateHandovers(bookingId: string, vehicleId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(bookingId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    // Hồ sơ khách hiện chặng của đơn hiện tại — giao/nhận xe lật chặng đó.
    void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    // Nhánh `vehicles` gồm danh sách + stats + alerts + summary + cụm bảo dưỡng của từng xe.
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    if (vehicleId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.maintenance(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    }
  };
}

/**
 * URL ký cho ẢNH THU NHỎ của một biên bản (chi tiết đơn, 03/11/2026) — chỉ khi người xem có
 * `handovers.file_view`. URL sống ngắn nên tự làm mới trước khi hết hạn; một ảnh hỏng không kéo
 * cả hàng về lỗi — ô đó rơi về trạng thái "Đã có ảnh".
 */
export function useHandoverPhotoPreviews(
  bookingId: string,
  type: HandoverType,
  photos: readonly HandoverPhoto[],
  enabled: boolean,
) {
  const withFile = photos.filter((photo) => photo.fileId);
  const ids = withFile.map((photo) => photo.fileId as string);
  return useQuery({
    queryKey: queryKeys.bookings.handoverPhotoPreviews(bookingId, type, ids),
    queryFn: async () => {
      const entries = await Promise.all(
        withFile.map(async (photo) => {
          try {
            const ticket = await fetchHandoverPhotoUrl(bookingId, type, photo.fileId as string);
            return [photo.slot, ticket.downloadUrl] as const;
          } catch {
            return [photo.slot, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, string | null>;
    },
    enabled: enabled && ids.length > 0,
    staleTime: 90_000,
    refetchInterval: 90_000,
  });
}
