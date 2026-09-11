import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { WalletView } from '@/features/wallet/components/WalletView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wallet');
  return { title: t('title.tenant'), robots: { index: false, follow: false } };
}

/**
 * Ví điểm của GIAN HÀNG — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2).
 *
 * KHÔNG gác bằng `PLAN_FEATURE`: đây là tiền của chính họ. Gói hết hạn vẫn phải xem và rút được
 * — ADR 0027 điều 3 nói hết hạn là `read_only` chứ không phải `hidden`, và tiền thì không thuộc
 * về gói.
 */
export default function ManageBalancePage() {
  return <WalletView scope="shop" />;
}
