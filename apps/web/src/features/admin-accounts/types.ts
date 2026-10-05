import type { components } from '@xeprime/types';

/** Một tài khoản khớp định danh — contract OpenAPI (ADR 0007). */
export type AccountLookupItem = components['schemas']['AccountLookupItemDto'];

/** Tra theo đúng MỘT định danh, khớp chính xác (ADR 0053 điều 9). */
export const ACCOUNT_LOOKUP_MODE = {
  PHONE: 'phone',
  EMAIL: 'email',
} as const;

export type AccountLookupMode = (typeof ACCOUNT_LOOKUP_MODE)[keyof typeof ACCOUNT_LOOKUP_MODE];

/** Định danh đang tra — sống ở URL (ADR 0004) để link tra cứu gửi được cho đồng nghiệp hỗ trợ. */
export interface AccountLookupFilters {
  phone?: string;
  email?: string;
}
