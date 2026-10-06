import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { WalletView } from '@/features/wallet/components/WalletView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wallet');
  return { title: t('title.user'), robots: { index: false, follow: false } };
}

/**
 * Ví điểm của TÀI KHOẢN KHÁCH — tiền hoàn khoản giữ chỗ (ADR 0033 điều 5). Từ ADR 0053 phiên ở site
 * này luôn là tài khoản khách, nên không còn nhánh "chủ xe → chuyển sang sổ gian hàng": ví gian hàng
 * là của một tài khoản khác, ở site partner.
 */
export default function AccountBalancePage() {
  return <WalletView scope="account" />;
}
