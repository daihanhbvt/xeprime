import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type {
  BankTransaction,
  BankTransactionDetail,
  BankTransactionFilters,
  IgnoreBankTransactionInput,
  MatchBankTransactionInput,
} from './types';

export const BANK_TX_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type BankTransactionListResult = Paged<BankTransaction>;

export function filtersToParams(filters: BankTransactionFilters): QueryParams {
  return {
    matchStatus: filters.matchStatus ?? null,
    q: filters.q ?? null,
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
