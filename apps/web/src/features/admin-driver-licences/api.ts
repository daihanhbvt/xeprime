import { DRIVER_LICENCE_STATUS } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type { DriverLicenceImage } from '@/features/driver-licence/types';
import type {
  ApproveDriverLicenceInput,
  DriverLicenceQueueFilters,
  PlatformDriverLicence,
  PlatformDriverLicenceCounts,
  RejectDriverLicenceInput,
} from './types';

const BASE = '/platform/driver-licences';

export const DRIVER_LICENCE_QUEUE_LIMIT = DEFAULT_PAGE_SIZE;

/** Không lọc trạng thái = VIỆC CẦN LÀM (chờ duyệt) — cùng mặc định với server. */
export const DRIVER_LICENCE_QUEUE_DEFAULT_STATUS = DRIVER_LICENCE_STATUS.PENDING_REVIEW;

export function filtersToParams(filters: DriverLicenceQueueFilters) {
  return {
    status: filters.status ?? DRIVER_LICENCE_QUEUE_DEFAULT_STATUS,
    kind: filters.kind ?? null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVER_LICENCE_QUEUE_LIMIT,
  };
}

export const fetchDriverLicenceQueue = (
  filters: DriverLicenceQueueFilters,
): Promise<Paged<PlatformDriverLicence>> =>
  fetchPage<PlatformDriverLicence>(BASE, filtersToParams(filters), DRIVER_LICENCE_QUEUE_LIMIT);

export const fetchDriverLicenceCounts = (): Promise<PlatformDriverLicenceCounts> =>
  apiGet<PlatformDriverLicenceCounts>(`${BASE}/counts`);

export const fetchPlatformDriverLicence = (id: string): Promise<PlatformDriverLicence> =>
  apiGet<PlatformDriverLicence>(`${BASE}/${id}`);

/** Mỗi lần gọi là một dòng audit "đã mở ảnh bằng lái" ở server. */
export const fetchPlatformDriverLicenceImage = (id: string): Promise<DriverLicenceImage> =>
  apiGet<DriverLicenceImage>(`${BASE}/${id}/image`);

export const approveDriverLicence = (
  id: string,
  body: ApproveDriverLicenceInput,
): Promise<PlatformDriverLicence> => apiPost<PlatformDriverLicence>(`${BASE}/${id}/approve`, body);

export const rejectDriverLicence = (
  id: string,
  body: RejectDriverLicenceInput,
): Promise<PlatformDriverLicence> => apiPost<PlatformDriverLicence>(`${BASE}/${id}/reject`, body);
