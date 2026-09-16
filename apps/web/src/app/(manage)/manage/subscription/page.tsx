'use client';

import { useTranslations } from 'next-intl';

import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { SubscriptionWorkspace } from '@/features/subscription/components/SubscriptionWorkspace';

/**
 * "Gói của tôi" phía GIAN HÀNG. Toàn bộ nội dung nằm ở `SubscriptionWorkspace` — trang chỉ cấp
 * cho nó tiêu đề của khu quản lý, vì `/account/subscription` dựng cùng nội dung với tiêu đề khác.
 */
export default function SubscriptionPage() {
  const t = useTranslations('Subscription');
  return <SubscriptionWorkspace header={<ManagePageHeader title={t('page.title')} />} />;
}
