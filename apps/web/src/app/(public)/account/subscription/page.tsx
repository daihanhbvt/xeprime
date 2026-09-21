'use client';

import { Breadcrumb } from 'antd';
import Link from 'next/link';
import { OWNER_STAGE } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SubscriptionWorkspace } from '@/features/subscription/components/SubscriptionWorkspace';
import { UpgradeHeroArt } from '@/features/subscription/components/UpgradeHeroArt';

import styles from './page.module.css';

/**
 * `/account/subscription` — "Gói & hoá đơn" cho chủ xe tuyến hoa hồng.
 *
 * Cùng `SubscriptionWorkspace` với `/manage/subscription`, chỉ khác tiêu đề. Đây là phễu nâng
 * cấp lên tuyến gian hàng (ADR 0028 điều 1), nên nó phải mở từ bậc `registering`: người đang chờ
 * duyệt hồ sơ vẫn được quyền mua gói, và chặn họ ở đây là chặn doanh thu.
 *
 * `Suspense` là bắt buộc — phân trang hoá đơn đọc `useSearchParams`.
 */
export default function AccountSubscriptionPage() {
  const t = useTranslations('Subscription');
  const tNav = useTranslations('Navigation');

  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <Suspense fallback={<LoadingState variant="page" />}>
        <SubscriptionWorkspace
          header={
            <div className={styles.header}>
              {/*
                Vụn đường dẫn đặt ở TRANG, không thêm vào `AccountPageHeader`: đây là trang duy
                nhất trong khu tài khoản cần nó, và một prop mới trên component tiêu đề dùng
                chung sẽ là một prop không ai khác truyền.
              */}
              <Breadcrumb
                items={[
                  { title: <Link href={ROUTES.HOME}>{tNav('public.home')}</Link> },
                  { title: t('page.breadcrumb') },
                ]}
              />
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
