import type { components } from '@xeprime/types';

/** Type hàng đợi đối soát lấy từ contract OpenAPI (ADR 0007) — không viết tay DTO. */
type Schemas = components['schemas'];

export type BankTransaction = Schemas['BankTransactionDto'];
export type BankTransactionDetail = Schemas['BankTransactionDetailDto'];
export type BankTransactionSuggestion = Schemas['BankTransactionSuggestionDto'];
export type MatchBankTransactionInput = Schemas['MatchBankTransactionDto'];
export type IgnoreBankTransactionInput = Schemas['IgnoreBankTransactionDto'];

export interface BankTransactionFilters {
  matchStatus?: string;
  q?: string;
  /** `BankTxCodeFilter` — luồng của mã rút được, hoặc `no_code`. */
  code?: string;
  /** `YYYY-MM-DD` giờ VN, theo thời điểm ngân hàng. */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
