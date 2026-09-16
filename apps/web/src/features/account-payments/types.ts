import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Một khoản KHÁCH đã trả cho chuyến đã thuê — `payments`, không phải ví (PROMPT 5). */
export type AccountPayment = Schemas['AccountPaymentDto'];
export type AccountPaymentPage = Schemas['AccountPaymentPageDto'];
/** Phân trang + TỔNG. Tổng đi trong `meta` — xem docblock của `fetchAccountPayments`. */
export type AccountPaymentMeta = Schemas['AccountPaymentMetaDto'];
export type AccountPaymentTotals = Schemas['AccountPaymentTotalsDto'];
