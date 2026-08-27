import type { components } from '@xeprime/types';

/** Shape thanh toán lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type Payment = Schemas['PaymentDto'];
export type RecordPaymentInput = Schemas['RecordPaymentDto'];
