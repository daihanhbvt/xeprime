import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import {
  SUPPORT_BASE_PATH,
  type OpenSupportCaseInput,
  type PostSupportEventInput,
  type ResolveSupportCaseInput,
  type SupportCase,
  type SupportCaseDetail,
  type SupportCaseFilters,
  type SupportSurface,
  type TransitionSupportCaseInput,
} from './types';

export const SUPPORT_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function filtersToParams(surface: SupportSurface, filters: SupportCaseFilters): QueryParams {
  return {
    // Bề mặt nằm TRONG query key để ba màn không dùng lẫn cache của nhau: cùng một `id` trả về
    // dòng thời gian khác nhau (ghi chú nội bộ chỉ nền tảng thấy).
    surface,
    status: filters.status ?? null,
    category: filters.category ?? null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? SUPPORT_DEFAULT_LIMIT,
  };
}

export const fetchSupportCases = (
  surface: SupportSurface,
  filters: SupportCaseFilters,
): Promise<Paged<SupportCase>> => {
  const { surface: _ignored, ...params } = filtersToParams(surface, filters);
  return fetchPage<SupportCase>(SUPPORT_BASE_PATH[surface], params, SUPPORT_DEFAULT_LIMIT);
};

export const fetchSupportCase = (
  surface: SupportSurface,
  id: string,
): Promise<SupportCaseDetail> =>
  apiGet<SupportCaseDetail>(`${SUPPORT_BASE_PATH[surface]}/${id}`);

export const openSupportCase = (
  surface: SupportSurface,
  body: OpenSupportCaseInput,
): Promise<SupportCaseDetail> =>
  apiPost<SupportCaseDetail>(SUPPORT_BASE_PATH[surface], body);

export const postSupportMessage = (
  surface: SupportSurface,
  id: string,
  body: PostSupportEventInput,
): Promise<SupportCaseDetail> =>
  apiPost<SupportCaseDetail>(`${SUPPORT_BASE_PATH[surface]}/${id}/messages`, body);

export const transitionSupportCase = (
  surface: SupportSurface,
  id: string,
  body: TransitionSupportCaseInput,
): Promise<SupportCaseDetail> =>
  apiPost<SupportCaseDetail>(`${SUPPORT_BASE_PATH[surface]}/${id}/transition`, body);

export const resolveSupportCase = (
  id: string,
  body: ResolveSupportCaseInput,
): Promise<SupportCaseDetail> =>
  apiPost<SupportCaseDetail>(`/platform/support/cases/${id}/resolve`, body);
