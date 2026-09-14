import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type PlatformHold = Schemas['PlatformHoldDto'];
export type PlatformHoldRefund = Schemas['PlatformHoldRefundDto'];
export type DailyReconciliation = Schemas['DailyReconciliationDto'];
export type SettleHoldInput = Schemas['SettleHoldDto'];
export type MarkRefundPaidInput = Schemas['MarkRefundPaidDto'];
export type RejectRefundInput = Schemas['RejectRefundDto'];
export type SaveBankBalanceInput = Schemas['SaveBankBalanceDto'];

/** Hợp đồng bảo hiểm nhìn từ ADMIN — Phase 7. */
export type PlatformInsurancePolicy = Schemas['PlatformInsurancePolicyDto'];
export type PlatformInsurancePage = Schemas['PlatformInsurancePageDto'];

/** Bỏ trống `status` = hàng đợi VIỆC CẦN LÀM (đang lỗi). */
export interface InsuranceFilters {
  status?: string | null;
  page?: number;
}

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

/** Một lệnh rút nhìn từ ADMIN — số tài khoản ĐẦY ĐỦ, vì họ phải gõ nó vào app ngân hàng. */
export type PlatformWithdrawal = Schemas['PlatformWithdrawalDto'];
export type PlatformWithdrawalPage = Schemas['PlatformWithdrawalPageDto'];
export type MarkWithdrawalPaidInput = Schemas['MarkWithdrawalPaidDto'];

/** Bộ lọc hàng đợi rút. Bỏ trống `status` = VIỆC CẦN LÀM (chờ duyệt + đã duyệt chưa chuyển). */
export interface WithdrawalFilters {
  status?: string | null;
  overdue?: boolean;
  page?: number;
}
