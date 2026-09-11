import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { WalletView } from '@/features/wallet/components/WalletView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wallet');
  return { title: t('title.user'), robots: { index: false, follow: false } };
}

/**
 * Ví điểm của MỘT CON NGƯỜI — ADR 0033.
 *
 * Không gắn `OwnerGate`: khách thuê cũng có số dư (tiền hoàn cọc), và đó là phần lớn người dùng
 * của màn này. Chủ gian hàng có ví riêng ở `/manage/balance` — hai loại tiền, hai sổ, không trộn.
 */
export default function AccountBalancePage() {
  return <WalletView scope="account" />;
}
