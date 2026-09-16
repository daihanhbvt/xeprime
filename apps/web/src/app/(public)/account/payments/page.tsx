import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AccountPaymentsView } from '@/features/account-payments/components/AccountPaymentsView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('payments'), robots: { index: false, follow: false } };
}

/**
 * "Tiền của các chuyến đã thuê" — đọc từ `payments`, **KHÔNG phải ví** (PROMPT 5).
 *
 * Khách có ba loại tiền ở ba chỗ: đã trả cho gian hàng (màn này), đã chuyển giữ chỗ cho XePrime
 * (chi tiết chuyến), và XePrime đang nợ mình (`/account/balance`). View nói ra cả ba ngay ở đầu
 * thay vì để người dùng đoán họ đang xem cái nào.
 */
export default function AccountPaymentsPage() {
  return <AccountPaymentsView />;
}
