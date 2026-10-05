'use client';

import { useTranslations } from 'next-intl';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { SupportCasesView } from '@/features/support-cases/components/SupportCasesView';
import { SUPPORT_SURFACE } from '@/features/support-cases/types';

/**
 * Hàng đợi hỗ trợ/tranh chấp toàn sàn — ADR 0028 release gate 7 (R3).
 *
 * Đây là bên DUY NHẤT kết luận được một tranh chấp, và kết luận đó mở khoá việc chốt kết cục
 * khoản giữ chỗ ở màn money operations. Hai bước tách rời: phán xét ở đây, kế toán ở đó.
 */
export default function AdminSupportPage() {
  const t = useTranslations('SupportCases');

  return (
    <div>
      <ManagePageHeader title={t('page.platformTitle')} subtitle={t('page.platformSubtitle')} />
      <SupportCasesView surface={SUPPORT_SURFACE.PLATFORM} />
    </div>
  );
}
