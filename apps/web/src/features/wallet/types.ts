import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Số dư — BA con số, không phải một.
 *
 * `available` rút được ngay · `pending` đang chờ chuyển · `total` là nghĩa vụ XePrime với chủ ví.
 * Hiện một con số duy nhất sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế, hoặc tưởng
 * tiền đã biến mất trong lúc chờ.
 */
export type WalletSummary = Schemas['WalletSummaryDto'];

/** Một dòng sổ. `amount` dương = vào ví, âm = ra. */
export type WalletEntry = Schemas['WalletEntryDto'];
export type WalletEntryPage = Schemas['WalletEntryPageDto'];

/** Yêu cầu rút nhìn từ chủ ví — số tài khoản đã che. */
export type WithdrawalRequest = Schemas['WithdrawalRequestDto'];
export type CreateWithdrawalInput = Schemas['CreateWithdrawalDto'];

/** Hai bề mặt dùng chung một feature — khác nhau đúng ở tiền tố đường dẫn. */
export type WalletScope = 'account' | 'shop';
