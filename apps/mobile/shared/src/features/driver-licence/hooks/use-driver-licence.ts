import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DRIVER_LICENCE_STATUS } from '@xeprime/types';
import {
  driverLicenceApi,
  type DriverLicence,
  type DriverLicenceOverview,
} from '@/api/driver-licence/api';
import { queryKeys } from '@/queries/query-keys';
import { submitDriverLicence, type PreparedLicenceImage } from '../prepare-licence-image';

/** Đang đọc ảnh: hỏi lại dày để kết quả hiện ra ngay khi có — cùng số với web. */
export const PROCESSING_POLL_MS = 1_500;

/** Nhịp hỏi lại theo trạng thái lượt nộp gần nhất — tách ra để test không cần QueryClient. */
export function driverLicencePollInterval(
  overview: DriverLicenceOverview | undefined,
): number | false {
  const status = overview?.latest?.status;
  if (status === DRIVER_LICENCE_STATUS.PROCESSING) return PROCESSING_POLL_MS;
  return false;
}

/**
 * Bằng lái của tài khoản (ADR 0057). Màn Giấy tờ và bước bằng lái khi đặt xe đọc CÙNG khoá
 * `queryKeys.driverLicence.overview`, nên nộp ở chỗ này thì chỗ kia thấy ngay.
 */
export function useDriverLicence(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.driverLicence.overview,
    queryFn: () => driverLicenceApi.overview(),
    enabled: options.enabled ?? true,
    refetchInterval: (query) => driverLicencePollInterval(query.state.data),
  });
}

/** Đặt lượt nộp vừa có vào cache NGAY — màn hình chuyển sang "đang đọc" không chờ một vòng hỏi. */
export function withLatest(
  previous: DriverLicenceOverview | undefined,
  latest: DriverLicence,
): DriverLicenceOverview {
  return { verified: previous?.verified ?? null, latest };
}

export function useSubmitDriverLicence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: PreparedLicenceImage) => submitDriverLicence(image),
    onSuccess: (licence) => {
      queryClient.setQueryData<DriverLicenceOverview>(queryKeys.driverLicence.overview, (prev) =>
        withLatest(prev, licence),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.driverLicence.overview });
    },
  });
}

/** URL ảnh ký sẵn sống 120 giây ở server — cache phải hết hạn trước đó. */
const LICENCE_IMAGE_URL_STALE_MS = 90_000;
const LICENCE_IMAGE_URL_GC_MS = 100_000;

/** URL xem ảnh — sống 120 giây ở server; cache ngắn hơn thế. */
export function useDriverLicenceImage(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.driverLicence.image(id ?? ''),
    queryFn: () => driverLicenceApi.image(id as string),
    enabled: Boolean(id),
    staleTime: LICENCE_IMAGE_URL_STALE_MS,
    gcTime: LICENCE_IMAGE_URL_GC_MS,
  });
}
