import type { components } from '@xeprime/types';

/** Quyết toán cuối chuyến (Wave 10) — type sinh từ OpenAPI (ADR 0007), không viết tay. */
type Schemas = components['schemas'];

export type BookingSettlement = Schemas['BookingSettlementDto'];
export type BookingSurcharge = Schemas['BookingSurchargeDto'];
export type SaveSurchargeInput = Schemas['SaveSurchargeDto'];
export type VoidSurchargeInput = Schemas['VoidSurchargeDto'];
export type DepositRefund = Schemas['DepositRefundDto'];
export type RecordRefundInput = Schemas['RecordDepositRefundDto'];
export type CorrectRefundInput = Schemas['CorrectDepositRefundDto'];
export type OvertimeSuggestion = Schemas['OvertimeSuggestionDto'];
