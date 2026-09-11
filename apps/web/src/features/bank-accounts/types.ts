import type { components } from '@xeprime/types';

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

/** Hai bề mặt dùng chung một feature — khác nhau đúng ở tiền tố đường dẫn. */
export type BankAccountScope = 'account' | 'shop';
