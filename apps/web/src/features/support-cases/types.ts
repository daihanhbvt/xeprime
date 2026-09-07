import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type SupportCase = Schemas['SupportCaseDto'];
export type SupportCaseDetail = Schemas['SupportCaseDetailDto'];
export type SupportCaseEvent = Schemas['SupportCaseEventDto'];
export type OpenSupportCaseInput = Schemas['OpenSupportCaseDto'];
export type PostSupportEventInput = Schemas['PostSupportEventDto'];
export type TransitionSupportCaseInput = Schemas['TransitionSupportCaseDto'];
export type ResolveSupportCaseInput = Schemas['ResolveSupportCaseDto'];

/**
 * Ba bề mặt của CÙNG một nghiệp vụ — khách, gian hàng, nền tảng. Khác nhau đúng hai thứ: đường
 * dẫn gốc và tập hành động. Phạm vi đọc là việc của server (`SupportService.scopeWhere`), không
 * phải của client — nên không có bộ lọc "chỉ case của tôi" ở đây.
 */
export const SUPPORT_SURFACE = {
  CUSTOMER: 'customer',
  TENANT: 'tenant',
  PLATFORM: 'platform',
} as const;

export type SupportSurface = (typeof SUPPORT_SURFACE)[keyof typeof SUPPORT_SURFACE];

export const SUPPORT_BASE_PATH: Readonly<Record<SupportSurface, string>> = {
  [SUPPORT_SURFACE.CUSTOMER]: '/me/support/cases',
  [SUPPORT_SURFACE.TENANT]: '/support/cases',
  [SUPPORT_SURFACE.PLATFORM]: '/platform/support/cases',
};

export interface SupportCaseFilters {
  status?: string;
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
}
