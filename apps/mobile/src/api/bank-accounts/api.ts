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

  /** Đặt làm mặc định — server tự gỡ cờ của tài khoản cũ, client không phải gọi hai lệnh. */
  setDefault(scope: BankAccountScope, id: string): Promise<BankAccount> {
    return getApiClient().patch<BankAccount>(`${base(scope)}/${id}/default`);
  },

  /** Gỡ khỏi danh sách. LƯU TRỮ chứ không xoá: lệnh chi cũ vẫn phải tra được về tài khoản đích. */
  archive(scope: BankAccountScope, id: string): Promise<void> {
    return getApiClient().delete<void>(`${base(scope)}/${id}`);
  },
};
