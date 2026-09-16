import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { WalletView } from '@/features/wallet/components/WalletView';

import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wallet');
  return { title: t('title.tenant'), robots: { index: false, follow: false } };
}

/**
 * "Số dư & rút tiền" của GIAN HÀNG — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2).
 *
 * KHÔNG gác bằng `PLAN_FEATURE`: đây là tiền của chính họ. Gói hết hạn vẫn phải xem và rút được
 * — ADR 0027 điều 3 nói hết hạn là `read_only` chứ không phải `hidden`, và tiền thì không thuộc
 * về gói.
 *
 * Tiêu đề dựng ở TRANG, không trong `WalletView`: cùng component đó còn phục vụ `/account/balance`
 * với bộ tiêu đề riêng của khu tài khoản, và mỗi trang chỉ được có đúng một `h1`. Trước
 * 16/09/2026 trang này không có `h1` nào — heading đầu tiên là `h2` của thẻ tổng quan số dư, nên
 * người dùng trình đọc màn hình không có mốc "đây là trang gì".
 */
export default async function ManageBalancePage() {
  const t = await getTranslations('Wallet');
  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title.tenant')} subtitle={t('page.subtitle')} />
      <WalletView scope="shop" />
    </div>
  );
}
