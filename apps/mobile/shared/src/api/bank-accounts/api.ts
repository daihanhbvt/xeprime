import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/**
 * Tài khoản nhận tiền nhìn từ màn hình — số tài khoản ĐÃ CHE.
 *
 * Server không bao giờ trả số đầy đủ ra bề mặt này: người dùng chỉ cần nhận ra tài khoản nào là
 * của mình, không cần đọc lại nó. Số đầy đủ chỉ đi theo đường ghi lệnh chi ở backend.
 */
export type BankAccount = Schemas['BankAccountDto'];

/** Thân request thêm tài khoản. Chủ sở hữu suy từ session, không nằm ở đây. */
export type SaveBankAccountInput = Schemas['SaveBankAccountDto'];

/** Yêu cầu ĐỔI tài khoản nhận tiền (biên bản họp 19/11/2026) - tài khoản khoá từ lần khai đầu. */
export type BankAccountChangeRequest = Schemas['BankAccountChangeRequestDto'];
export type CreateBankAccountChangeRequestInput = Schemas['CreateBankAccountChangeRequestDto'];

/**
 * Hai bề mặt dùng chung một feature — khác nhau đúng ở TIỀN TỐ đường dẫn, y như web.
 *
 * Chủ sở hữu KHÔNG bao giờ nằm trong body: backend suy từ session và membership. Một API nhận
 * chủ từ payload là một API cho phép người lạ trỏ lệnh chuyển tiền về tài khoản của mình.
 */
export const BANK_ACCOUNT_SCOPE = {
  ACCOUNT: 'account',
  SHOP: 'shop',
} as const;

export type BankAccountScope = (typeof BANK_ACCOUNT_SCOPE)[keyof typeof BANK_ACCOUNT_SCOPE];

const base = (scope: BankAccountScope) => `/${scope}/bank-accounts`;

export const bankAccountsApi = {
  list(scope: BankAccountScope): Promise<BankAccount[]> {
    return getApiClient().get<BankAccount[]>(base(scope));
  },

  create(scope: BankAccountScope, body: SaveBankAccountInput): Promise<BankAccount> {
    return getApiClient().post<BankAccount>(base(scope), body);
  },

  /** Yêu cầu đổi đang chờ xác minh (`null` = không có) - web `fetchCurrentChangeRequest`. */
  currentChangeRequest(scope: BankAccountScope): Promise<BankAccountChangeRequest | null> {
    return getApiClient().get<BankAccountChangeRequest | null>(`${base(scope)}/change-requests/current`);
  },

  createChangeRequest(
    scope: BankAccountScope,
    body: CreateBankAccountChangeRequestInput,
  ): Promise<BankAccountChangeRequest> {
    return getApiClient().post<BankAccountChangeRequest>(`${base(scope)}/change-requests`, body);
  },

  cancelChangeRequest(scope: BankAccountScope, id: string): Promise<void> {
    return getApiClient().post<void>(`${base(scope)}/change-requests/${id}/cancel`, {});
  },

  // Không còn `setDefault`/`archive` (web PR #159): mỗi chủ MỘT tài khoản, đổi là THAY qua `create`.
};
