import type { components } from '@xeprime/types';

/** Type hàng đợi đối soát lấy từ contract OpenAPI (ADR 0007) — không viết tay DTO. */
type Schemas = components['schemas'];

export type BankTransaction = Schemas['BankTransactionDto'];
export type BankTransactionDetail = Schemas['BankTransactionDetailDto'];
export type BankTransactionSuggestion = Schemas['BankTransactionSuggestionDto'];
export type MatchBankTransactionInput = Schemas['MatchBankTransactionDto'];
export type IgnoreBankTransactionInput = Schemas['IgnoreBankTransactionDto'];
/** Khoản giữ chỗ / phụ lục còn nhận tiền — gợi ý khớp tay (ADR 0092). */
export type BankTxReceivableSuggestion = Schemas['BankTxReceivableSuggestionDto'];
/** Khoản đã đóng mà tiền mới về — đích của lượt ghi có Ví điểm khách (ADR 0092). */
export type BankTxLateCredit = Schemas['BankTxLateCreditDto'];
export type MatchReceivableInput = Schemas['MatchReceivableDto'];
export type CreditCustomerInput = Schemas['CreditCustomerDto'];

export interface BankTransactionFilters {
  matchStatus?: string;
  q?: string;
  /** `BankTxCodeFilter` — luồng của mã rút được, hoặc `no_code`. */
  code?: string;
  /** `YYYY-MM-DD` giờ VN, theo thời điểm ngân hàng. */
  from?: string;
  to?: string;
  /** Số tiền vào chính xác (chuỗi chữ số). */
  amount?: string;
  /** `BankMatchReason` — lý do hệ thống ghi. */
  reason?: string;
  page?: number;
  limit?: number;
}
