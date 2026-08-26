'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ERROR_CODE, type HandoverPhotoSlot, type HandoverType } from '@xeprime/types';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import {
  cancelTrip,
  fetchTrip,
  fetchTripHandoverEvidence,
  fetchTripHandoverPhotoUrl,
  fetchTrips,
  tripsToParams,
} from './api';
import type { CustomerTripHandoverEvidence } from './types';

/** Danh sách chuyến của khách. Lọc + phân trang ở server; `filter` sống trên URL (ADR 0004). */
export function useTrips(filter: string, page: number) {
  return useQuery({
    queryKey: queryKeys.trips.list(tripsToParams(filter, page)),
    queryFn: () => fetchTrips(filter, page),
    // Đổi tab không nháy sang trống rồi mới có dữ liệu.
    placeholderData: keepPreviousData,
  });
}

/** Một chuyến. `id` nhận cả id yêu cầu lẫn id đơn — thông báo trỏ vào cả hai loại. */
export function useTrip(id: string) {
  return useQuery({
    queryKey: queryKeys.trips.detail(id),
    queryFn: () => fetchTrip(id),
    enabled: Boolean(id),
  });
}

/**
 * Biên bản bàn giao của một chuyến.
 *
 * Truy vấn RIÊNG chứ không nhét vào `useTrip`: chi tiết chuyến là thứ mở ra ở mọi chặng, còn
 * biên bản chỉ tồn tại từ lúc gian hàng xác nhận giao xe. Gộp lại nghĩa là mọi chuyến chờ duyệt
 * cũng phải trả giá cho một phép nối mà nó không bao giờ dùng.
 *
 * `enabled` do nơi gọi quyết định — màn chi tiết chỉ bật khi chuyến đã thật sự có mốc bàn giao,
 * nên chuyến chưa giao xe không phát request nào.
 */
export function useTripHandoverEvidence(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.trips.handoverEvidence(id),
    queryFn: () => fetchTripHandoverEvidence(id),
    enabled: Boolean(id) && enabled,
  });
}

/**
 * URL ký cho ẢNH THU NHỎ của mọi ô ảnh trong biên bản — một lượt cho cả khối.
 *
 * Vì sao nạp sẵn thay vì xin theo từng cú bấm: một ô ảnh không có ảnh thì không còn là bằng
 * chứng, chỉ là một cái nút hứa hẹn. Khách phải NHÌN thấy hiện trạng ngay, không phải bấm từng
 * góc để đoán bên trong có gì.
 *
 * Rẻ vì bị chặn hai lớp: khối này chỉ nạp khi người dùng MỞ nó ra, và một chuyến tối đa hai
 * biên bản × `HANDOVER_MAX_PHOTOS` ảnh.
 *
 * `staleTime` 90 giây nằm DƯỚI hạn 120 giây của vé ký: sau đó key được coi là cũ và làm mới,
 * nên không có ô nào cầm một URL đã hết hạn. Cùng cách làm với ảnh giấy tờ khách (Wave 5.1).
 */
export function useTripHandoverPhotos(
  id: string,
  records: CustomerTripHandoverEvidence[],
  enabled: boolean,
) {
  const keys = records.flatMap((record) =>
    record.photos.map((photo) => photoKey(record.type, photo.slot)),
  );

  return useQuery({
    queryKey: queryKeys.trips.handoverPhotos(id, keys),
    queryFn: async () => {
      const tickets = await Promise.all(
        keys.map(async (key) => {
          const [type, slot] = key.split(':') as [HandoverType, HandoverPhotoSlot];
          try {
            const ticket = await fetchTripHandoverPhotoUrl(id, type, slot);
            return [key, ticket.downloadUrl] as const;
          } catch {
            // Một ảnh hỏng KHÔNG kéo cả lưới về trạng thái lỗi — ô đó rơi về ô trống có nhãn.
            return [key, null] as const;
          }
        }),
      );
      return Object.fromEntries(tickets) as Record<string, string | null>;
    },
    enabled: Boolean(id) && enabled && keys.length > 0,
    staleTime: 90_000,
  });
}

/** Khoá của MỘT ô ảnh trong khối: chiều bàn giao + góc chụp. Dùng chung hook ↔ component. */
export function photoKey(type: string, slot: string): string {
  return `${type}:${slot}`;
}

/**
 * Khách tự huỷ chuyến.
 *
 * Server trả về chính chuyến đã đổi chặng nên ghi thẳng vào cache chi tiết — màn cập nhật ngay,
 * không nháy qua trạng thái cũ. Danh sách thì phải `invalidate`: số đếm trên từng tab do server
 * tính, đoán lại ở client là cách chắc chắn để tab "Chờ xác nhận" đứng sai một đơn vị.
 */
export function useCancelTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelTrip(id),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trips.detail(id), trip);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
    /*
     * `TRIP_CANCEL_NOT_ALLOWED` nghĩa là chuyến đã sang chặng khác kể từ lúc màn này tải —
     * gian hàng vừa duyệt, hoặc vừa bấm giao xe. Màn đang cầm dữ liệu cũ, nên ngoài việc báo
     * lỗi phải kéo lại trạng thái thật: nút "Huỷ chuyến" tự biến mất thay vì mời bấm lại một
     * việc chắc chắn hỏng.
     */
    onError: (error) => {
      if (getErrorCode(error) === API_ERROR_CODE.TRIP_CANCEL_NOT_ALLOWED) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      }
    },
  });
}
