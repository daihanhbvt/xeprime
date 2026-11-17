import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type {
  BankTransaction,
  BankTransactionDetail,
  BankTransactionFilters,
  CreditCustomerInput,
  IgnoreBankTransactionInput,
  MatchBankTransactionInput,
  MatchReceivableInput,
} from './types';

export const BANK_TX_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type BankTransactionListResult = Paged<BankTransaction>;

export function filtersToParams(filters: BankTransactionFilters): QueryParams {
  return {
    matchStatus: filters.matchStatus ?? null,
    q: filters.q ?? null,
    code: filters.code ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
    amount: filters.amount ?? null,
    reason: filters.reason ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? BANK_TX_DEFAULT_LIMIT,
  };
}

export const fetchBankTransactions = (
  filters: BankTransactionFilters,
): Promise<BankTransactionListResult> =>
  fetchPage<BankTransaction>(
    '/platform/bank-transactions',
    filtersToParams(filters),
    BANK_TX_DEFAULT_LIMIT,
  );

export const fetchBankTransaction = (id: string): Promise<BankTransactionDetail> =>
  apiGet<BankTransactionDetail>(`/platform/bank-transactions/${id}`);

export const matchBankTransaction = (
  id: string,
  body: MatchBankTransactionInput,
): Promise<BankTransactionDetail> =>
  apiPost<BankTransactionDetail>(`/platform/bank-transactions/${id}/match`, body);

export const ignoreBankTransaction = (
  id: string,
  body: IgnoreBankTransactionInput,
): Promise<BankTransactionDetail> =>
  apiPost<BankTransactionDetail>(`/platform/bank-transactions/${id}/ignore`, body);

/** Khớp tay vào một khoản giữ chỗ / phụ lục còn nhận tiền (ADR 0092). */
export const matchReceivable = (
  id: string,
  body: MatchReceivableInput,
): Promise<BankTransactionDetail> =>
  apiPost<BankTransactionDetail>(`/platform/bank-transactions/${id}/match-receivable`, body);

/** Ghi có Ví điểm khách cho tiền về sau khi khoản đã đóng (ADR 0092). */
export const creditCustomer = (
  id: string,
  body: CreditCustomerInput,
): Promise<BankTransactionDetail> =>
  apiPost<BankTransactionDetail>(`/platform/bank-transactions/${id}/credit-customer`, body);
