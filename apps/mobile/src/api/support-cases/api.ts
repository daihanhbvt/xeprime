import type { components, SupportCaseCategory, SupportCaseStatus } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type SupportCase = Schemas['SupportCaseDto'];
export type SupportCaseDetail = Schemas['SupportCaseDetailDto'];
export type OpenSupportCaseInput = Schemas['OpenSupportCaseDto'];
export type SupportCaseEvent = Schemas['SupportCaseEventDto'];
export type PostSupportEventInput = Schemas['PostSupportEventDto'];
export type TransitionSupportCaseInput = Schemas['TransitionSupportCaseDto'];

/**
 * Hai bề mặt của CÙNG một nghiệp vụ — khách và gian hàng. Khác nhau đúng hai thứ: đường dẫn gốc
 * và tập hành động.
 *
 * Bề mặt NỀN TẢNG (`/platform/support/cases`) cố ý KHÔNG có ở đây: nó là màn của nhân sự XePrime
 * (kết luận tranh chấp, ghi chú nội bộ), nằm ngoài phạm vi app khách hàng. Thêm nó vào đúng lúc
 * dựng màn tương ứng, đừng dựng sẵn một nhánh chưa ai gọi.
 *
 * Phạm vi đọc là việc của server (`SupportService.scopeWhere`), không phải của client — nên
 * không có bộ lọc "chỉ case của tôi" ở đây.
 */
export const SUPPORT_SURFACE = {
  CUSTOMER: 'customer',
  TENANT: 'tenant',
} as const;

export type SupportSurface = (typeof SUPPORT_SURFACE)[keyof typeof SUPPORT_SURFACE];

const BASE_PATH: Readonly<Record<SupportSurface, string>> = {
  [SUPPORT_SURFACE.CUSTOMER]: '/me/support/cases',
  [SUPPORT_SURFACE.TENANT]: '/support/cases',
};

export interface SupportCaseFilters {
  status?: SupportCaseStatus;
  category?: SupportCaseCategory;
  page?: number;
  limit?: number;
}

export type SupportCasePage = Paged<SupportCase>;

/** Cỡ trang mặc định của danh sách yêu cầu hỗ trợ — màn hình đọc lại hằng này. */
export const SUPPORT_CASES_PAGE_SIZE = 20;

export function supportCasesToParams(
  surface: SupportSurface,
  filters: SupportCaseFilters,
): QueryParams {
  return {
    // Bề mặt nằm TRONG query key để hai màn không dùng lẫn cache của nhau — cùng quy ước với web.
    // Nó KHÔNG đi ra request: đường dẫn gốc đã nói rồi, và server không đọc tham số này.
    surface,
    status: filters.status ?? null,
    category: filters.category ?? null,
    page: filters.page ?? null,
    limit: filters.limit ?? null,
  };
}

export const supportCasesApi = {
  /**
   * Mặc định server chỉ trả case CÒN MỞ — đúng thứ màn "Yêu cầu xoá tài khoản" cần để biết có
   * yêu cầu nào đang chờ hay không, mà không phải tự lọc theo trạng thái ở client.
   */
  list(surface: SupportSurface, filters: SupportCaseFilters): Promise<SupportCasePage> {
    // `surface` chỉ nằm trong query KEY (xem `supportCasesToParams`), không đi ra request.
    const { surface: _surface, ...query } = supportCasesToParams(surface, filters);
    return getApiClient().fetchPage<SupportCase>(
      BASE_PATH[surface],
      query,
      filters.limit ?? SUPPORT_CASES_PAGE_SIZE,
    );
  },

  /** Một yêu cầu kèm TRỌN dòng thời gian. Server đã lọc bỏ ghi chú nội bộ trước khi trả. */
  detail(surface: SupportSurface, id: string): Promise<SupportCaseDetail> {
    return getApiClient().get<SupportCaseDetail>(`${BASE_PATH[surface]}/${id}`);
  },

  open(surface: SupportSurface, body: OpenSupportCaseInput): Promise<SupportCaseDetail> {
    return getApiClient().post<SupportCaseDetail>(BASE_PATH[surface], body);
  },

  /** Gửi một câu trả lời vào dòng thời gian. */
  postMessage(
    surface: SupportSurface,
    id: string,
    body: PostSupportEventInput,
  ): Promise<SupportCaseDetail> {
    return getApiClient().post<SupportCaseDetail>(`${BASE_PATH[surface]}/${id}/messages`, body);
  },

  /**
   * Đổi trạng thái. CẢ HAI bề mặt ở đây chỉ đi được tới `closed` — mọi nấc khác là việc của nền
   * tảng, và server từ chối phần còn lại.
   */
  transition(
    surface: SupportSurface,
    id: string,
    body: TransitionSupportCaseInput,
  ): Promise<SupportCaseDetail> {
    return getApiClient().post<SupportCaseDetail>(`${BASE_PATH[surface]}/${id}/transition`, body);
  },

  /**
   * Rút yêu cầu xoá tài khoản — chỉ case `account_deletion` còn mở do chính mình mở.
   *
   * Gắn cứng bề mặt KHÁCH: xoá tài khoản là việc của một CON NGƯỜI, không phải của gian hàng, và
   * server từ chối đường này ở mọi bề mặt khác.
   */
  withdrawAccountDeletion(id: string): Promise<SupportCaseDetail> {
    return getApiClient().post<SupportCaseDetail>(
      `${BASE_PATH[SUPPORT_SURFACE.CUSTOMER]}/${id}/withdraw`,
    );
  },
};
