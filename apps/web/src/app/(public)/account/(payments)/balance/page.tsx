import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { AccountBalanceView } from '@/features/account-payments/components/AccountBalanceView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountPayments.hub');
  return { title: t('tabs.balance'), robots: { index: false, follow: false } };
}

/**
 * Tab "Tài khoản thanh toán" — ví điểm của TÀI KHOẢN KHÁCH (tiền hoàn khoản giữ chỗ, ADR 0033
 * điều 5) + tài khoản nhận tiền. Từ ADR 0053 phiên ở site này luôn là tài khoản khách, nên không
 * còn nhánh "chủ xe → chuyển sang sổ gian hàng": ví gian hàng là của một tài khoản khác, ở site
 * partner.
 *
 * `Suspense`: view đọc `?section=` để cuộn tới khối tài khoản nhận tiền.
 */
export default function AccountBalancePage() {
  return (
    <Suspense fallback={null}>
      <AccountBalanceView />
    </Suspense>
  );
}
