import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type PlatformHold = Schemas['PlatformHoldDto'];
export type PlatformHoldRefund = Schemas['PlatformHoldRefundDto'];
export type DailyReconciliation = Schemas['DailyReconciliationDto'];
export type SettleHoldInput = Schemas['SettleHoldDto'];
export type MarkRefundPaidInput = Schemas['MarkRefundPaidDto'];
export type RejectRefundInput = Schemas['RejectRefundDto'];

export interface HoldFilters {
  status?: string;
  /** Chỉ hold ĐÃ TRẢ mà chưa chốt kết cục — hàng đợi thật của admin. */
  unsettled?: boolean;
  q?: string;
  page?: number;
  limit?: number;
}

export interface RefundFilters {
  status?: string;
  page?: number;
  limit?: number;
}
