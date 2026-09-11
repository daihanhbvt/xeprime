import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/api-client';
import type { BankAccount, BankAccountScope, SaveBankAccountInput } from './types';

/**
 * Hai bề mặt — cá nhân và gian hàng — khác nhau đúng ở tiền tố đường dẫn, nên chúng đi qua cùng
 * bộ hàm với một tham số `scope`. Hai bản sao chỉ khác một chuỗi là hai chỗ để quên sửa.
 *
 * Chủ sở hữu KHÔNG bao giờ nằm trong body: backend suy từ session và membership. Một API nhận
 * chủ từ payload là một API cho phép người lạ trỏ lệnh chuyển tiền về tài khoản của mình.
 */
const base = (scope: BankAccountScope) => `/${scope}/bank-accounts`;

export const fetchBankAccounts = (scope: BankAccountScope): Promise<BankAccount[]> =>
  apiGet<BankAccount[]>(base(scope));

export const createBankAccount = (
  scope: BankAccountScope,
  body: SaveBankAccountInput,
): Promise<BankAccount> => apiPost<BankAccount>(base(scope), body);

export const setDefaultBankAccount = (
  scope: BankAccountScope,
  id: string,
): Promise<BankAccount> => apiPatch<BankAccount>(`${base(scope)}/${id}/default`);

export const archiveBankAccount = (scope: BankAccountScope, id: string): Promise<void> =>
  apiDelete<void>(`${base(scope)}/${id}`);
