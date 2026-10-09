import { bankDisplayName } from '@xeprime/domain';
import type { BankAccount } from '@/api/bank-accounts/api';

/**
 * Tài khoản nhận tiền đang dùng — `null` khi chưa khai hoặc chưa tải xong. Bản native của web
 * `current-account.ts`.
 *
 * Mỗi chủ MỘT tài khoản (07/10/2026, DB bảo đảm bằng partial unique); API vẫn trả MẢNG 0–1 phần
 * tử. Mọi chỗ đọc qua đây thay vì tự `list[0]`, để hình dạng đó đổi thì chỉ một nơi phải sửa.
 */
export function currentBankAccount(
  list: readonly BankAccount[] | undefined | null,
): BankAccount | null {
  return list?.[0] ?? null;
}

/** Tên gợi nhớ, không có thì tên ngân hàng. Tên ngân hàng là tên riêng — không dịch (ADR 0012). */
export function bankAccountTitle(account: Pick<BankAccount, 'label' | 'bankCode'>): string {
  return account.label || bankDisplayName(account.bankCode);
}

/** Dòng tóm tắt dùng trong câu "sẽ thay cho {account}". */
export function bankAccountSummary(
  account: Pick<BankAccount, 'label' | 'bankCode' | 'accountNumberMasked'>,
): string {
  return `${bankAccountTitle(account)} · ${account.accountNumberMasked}`;
}

/**
 * Lời báo sau khi lưu: thêm mới, đổi, hay gửi lại đúng tài khoản đang dùng (server trả CÙNG id,
 * chỉ cập nhật tên gợi nhớ).
 */
export function bankAccountSaveOutcome(
  replacing: Pick<BankAccount, 'id'> | null | undefined,
  saved: Pick<BankAccount, 'id'>,
): 'created' | 'changed' | 'unchanged' {
  if (!replacing) return 'created';
  return replacing.id === saved.id ? 'unchanged' : 'changed';
}
