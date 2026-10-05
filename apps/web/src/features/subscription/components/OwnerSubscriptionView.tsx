'use client';

import { OWNER_STAGE } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { OwnerGate } from '@/features/account/components/OwnerGate';

import { SubscriptionWorkspace } from './SubscriptionWorkspace';
import { UpgradeHeroArt } from './UpgradeHeroArt';
import styles from './OwnerSubscriptionView.module.css';

/**
 * "Gói dịch vụ" của chủ xe TUYẾN HOA HỒNG ở site partner — phễu nâng cấp lên tuyến gian hàng
 * (ADR 0028 điều 1).
 *
 * Cùng `SubscriptionWorkspace` với section "Gói & hạn mức" của tuyến gói, chỉ khác tiêu đề. Mở từ
 * bậc `registering`: người đang chờ duyệt hồ sơ vẫn được quyền mua gói, và chặn họ ở đây là chặn
 * doanh thu. `Suspense` là bắt buộc — phân trang hoá đơn đọc `useSearchParams`.
 *
 * Không có vụn đường dẫn riêng: khung partner đã có breadcrumb ở thanh trên.
 */
export function OwnerSubscriptionView() {
  const t = useTranslations('Subscription');

  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <Suspense fallback={<LoadingState variant="page" />}>
        <SubscriptionWorkspace
          header={
            <div className={styles.header}>
              <AccountPageHeader
                title={t('page.title')}
                subtitle={t('page.accountSubtitle')}
                extra={<UpgradeHeroArt />}
              />
            </div>
          }
          /* Ở đây màn này là cả một TRANG, nên khối "gói hiện hành" tự vẽ thẻ của nó. */
          framed
        />
      </Suspense>
    </OwnerGate>
  );
}
