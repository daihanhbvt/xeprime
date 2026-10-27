import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Một khoản KHÁCH đã trả cho chuyến đã thuê — `payments`, không phải ví (PROMPT 5). */
export type AccountPayment = Schemas['AccountPaymentDto'];
export type AccountPaymentPage = Schemas['AccountPaymentPageDto'];
/** Phân trang + TỔNG. Tổng đi trong `meta` — xem docblock của `fetchAccountPayments`. */
export type AccountPaymentMeta = Schemas['AccountPaymentMetaDto'];
export type AccountPaymentTotals = Schemas['AccountPaymentTotalsDto'];

/** Một dòng của "Lịch sử giao dịch" hợp nhất — `GET /account/transactions`. */
export type AccountTransaction = Schemas['AccountTransactionDto'];
export type AccountTransactionPage = Schemas['AccountTransactionPageDto'];
