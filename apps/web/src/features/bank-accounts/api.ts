import { apiGet, apiPost } from '@/services/api-client';
import type {
  BankAccount,
  BankAccountChangeRequest,
  BankAccountScope,
  CreateBankAccountChangeRequestInput,
  SaveBankAccountInput,
} from './types';

/**
 * Hai bề mặt — cá nhân và gian hàng — khác nhau đúng ở tiền tố đường dẫn, nên chúng đi qua cùng
 * bộ hàm với một tham số `scope`. Hai bản sao chỉ khác một chuỗi là hai chỗ để quên sửa.
 *
 * Chủ sở hữu KHÔNG bao giờ nằm trong body: backend suy từ session và membership. Một API nhận
 * chủ từ payload là một API cho phép người lạ trỏ lệnh chuyển tiền về tài khoản của mình.
 *
 * Mỗi chủ MỘT tài khoản nhận tiền (07/10/2026): web chỉ còn đọc và khai (thêm hoặc đổi). Hai
 * endpoint "đặt mặc định" và "bỏ dùng" còn ở API cho app native, web không gọi.
 */
const base = (scope: BankAccountScope) => `/${scope}/bank-accounts`;

export const fetchBankAccounts = (scope: BankAccountScope): Promise<BankAccount[]> =>
  apiGet<BankAccount[]>(base(scope));

/** Thêm khi chưa có, ĐỔI khi đã có — server lưu trữ tài khoản cũ trong cùng transaction. */
export const createBankAccount = (
  scope: BankAccountScope,
  body: SaveBankAccountInput,
): Promise<BankAccount> => apiPost<BankAccount>(base(scope), body);

// ── Yêu cầu đổi tài khoản (biên bản họp 19/11/2026) ─────────────────────────────────────────────

export const fetchCurrentChangeRequest = (
  scope: BankAccountScope,
): Promise<BankAccountChangeRequest | null> =>
  apiGet<BankAccountChangeRequest | null>(`${base(scope)}/change-requests/current`);

export const createChangeRequest = (
  scope: BankAccountScope,
  body: CreateBankAccountChangeRequestInput,
): Promise<BankAccountChangeRequest> =>
  apiPost<BankAccountChangeRequest>(`${base(scope)}/change-requests`, body);

export const cancelChangeRequest = (scope: BankAccountScope, id: string): Promise<void> =>
  apiPost<void>(`${base(scope)}/change-requests/${id}/cancel`, {});
