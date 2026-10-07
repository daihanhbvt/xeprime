import { bankDisplayName } from '@xeprime/domain';
import type { BankAccount } from './types';

/**
 * Tài khoản nhận tiền đang dùng — `null` khi chưa khai hoặc chưa tải xong.
 *
 * Mỗi chủ MỘT tài khoản (07/10/2026, database bảo đảm bằng partial unique); API vẫn trả MẢNG vì
 * đó là hợp đồng app native đang đọc. Mọi chỗ trên web đọc qua đây thay vì tự `list[0]`, để nếu
 * hình dạng đó đổi thì chỉ một nơi phải sửa.
 */
export function currentBankAccount(list: readonly BankAccount[] | undefined): BankAccount | null {
  return list?.[0] ?? null;
}

/**
 * Tên hiển thị của một tài khoản: tên gợi nhớ người dùng đặt, không có thì tên ngân hàng
 * ("Vietcombank", không phải mã "VCB"). Tên ngân hàng là tên riêng — không dịch (ADR 0012).
 */
export function bankAccountTitle(account: Pick<BankAccount, 'label' | 'bankCode'>): string {
  return account.label || bankDisplayName(account.bankCode);
}
