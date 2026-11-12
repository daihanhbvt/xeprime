import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PartnerBalanceView } from '@/features/wallet/components/PartnerBalanceView';

import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wallet');
  return { title: t('manage.title'), robots: { index: false, follow: false } };
}

/**
 * "Quản lý ví" — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2) và các lệnh rút, CÙNG một
 * trang cho gian hàng tuyến gói và chủ xe tuyến hoa hồng. Chứa luôn "Tài khoản nhận tiền"
 * (`/bank-accounts` và `/shop?section=payout` cũ chuyển về đây) và thuế đã khấu trừ, ở cả hai
 * tuyến — xem `PartnerBalanceView`.
 *
 * KHÔNG gác bằng `PLAN_FEATURE`: đây là tiền của chính họ. Gói hết hạn vẫn phải xem và rút được
 * — ADR 0027 điều 3 nói hết hạn là `read_only` chứ không phải `hidden`, và tiền thì không thuộc
 * về gói.
 *
 * Tiêu đề dựng ở TRANG: mỗi trang chỉ được có đúng một `h1`. Suspense: thân trang đọc
 * `useSearchParams` (tab, kỳ, trang) — route tĩnh của Next cần ranh giới đó.
 */
export default async function ManageBalancePage() {
  const t = await getTranslations('Wallet');
  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('manage.title')} subtitle={t('manage.subtitle')} />
      <Suspense fallback={<LoadingState variant="cards" />}>
        <PartnerBalanceView />
      </Suspense>
    </div>
  );
}
