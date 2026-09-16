'use client';

import { OWNER_STAGE } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SubscriptionWorkspace } from '@/features/subscription/components/SubscriptionWorkspace';

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

  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <Suspense fallback={<LoadingState variant="page" />}>
        <SubscriptionWorkspace
          header={<AccountPageHeader title={t('page.title')} subtitle={t('page.accountSubtitle')} />}
        />
      </Suspense>
    </OwnerGate>
  );
}
