'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DRIVER_LICENCE_STATUS } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  fetchDriverLicenceImage,
  fetchDriverLicenceOverview,
  requestDriverLicenceReview,
  submitDriverLicence,
} from '../api';
import type { DriverLicence, DriverLicenceOverview } from '../types';

/** Đang đọc ảnh: hỏi lại dày để kết quả hiện ra ngay khi có. */
const PROCESSING_POLL_MS = 1_500;
/** Đang chờ người duyệt: hỏi thưa — trang vẫn tự đổi khi có kết quả mà không phải F5. */
const PENDING_REVIEW_POLL_MS = 30_000;

/**
 * Bằng lái của tài khoản. Tự hỏi lại khi lượt nộp gần nhất còn đang chờ kết quả — không có kênh
 * đẩy nào báo "đã đọc xong", nên hỏi lại là cách duy nhất màn hình tự chuyển trạng thái.
 */
export function useDriverLicence(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.driverLicence.overview,
    queryFn: fetchDriverLicenceOverview,
    enabled: options.enabled ?? true,
    refetchInterval: (query) => {
      const status = query.state.data?.latest?.status;
      if (status === DRIVER_LICENCE_STATUS.PROCESSING) return PROCESSING_POLL_MS;
      if (status === DRIVER_LICENCE_STATUS.PENDING_REVIEW) return PENDING_REVIEW_POLL_MS;
      return false;
    },
  });
}

/** Đặt lượt nộp vừa có vào cache NGAY — màn hình chuyển sang "đang đọc" không chờ một vòng hỏi. */
function withLatest(
  previous: DriverLicenceOverview | undefined,
  latest: DriverLicence,
): DriverLicenceOverview {
  return { verified: previous?.verified ?? null, latest };
}

export function useSubmitDriverLicence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; onProgress?: (percent: number) => void }) =>
      submitDriverLicence(input.file, input.onProgress),
    onSuccess: (licence) => {
      queryClient.setQueryData<DriverLicenceOverview>(queryKeys.driverLicence.overview, (prev) =>
        withLatest(prev, licence),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.driverLicence.overview });
    },
  });
}

export function useRequestDriverLicenceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requestDriverLicenceReview(id),
    onSuccess: (licence) => {
      queryClient.setQueryData<DriverLicenceOverview>(queryKeys.driverLicence.overview, (prev) =>
        withLatest(prev, licence),
      );
    },
  });
}

/**
 * URL xem ảnh — sống 120 giây ở server, nên giữ trong cache ngắn hơn thế một chút và không dùng
 * lại sau khi đã cũ (một ảnh hỏng vì URL hết hạn trông như ảnh bị xoá).
 */
export function useDriverLicenceImage(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.driverLicence.image(id ?? ''),
    queryFn: () => fetchDriverLicenceImage(id!),
    enabled: Boolean(id),
    staleTime: 90_000,
    gcTime: 100_000,
  });
}
