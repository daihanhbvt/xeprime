import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('BankAccounts');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Tài khoản nhận tiền của MỘT CON NGƯỜI — ADR 0033.
 *
 * Không gắn `OwnerGate`: khách thuê cũng cần trang này để nhận tiền hoàn khoản giữ chỗ, và đó
 * chính là chỗ luồng hoàn tiền đang tắc trước đợt này. Chủ gian hàng có thêm một danh sách riêng
 * ở `/manage` cho tiền của gian hàng — hai loại tiền, hai sổ, không trộn.
 */
export default function AccountBankAccountsPage() {
  return <BankAccountList scope="account" />;
}
