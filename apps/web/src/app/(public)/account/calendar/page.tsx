import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { CalendarScheduler } from '@/features/calendar/components/CalendarScheduler';

import styles from './calendar-page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('calendar'), robots: { index: false, follow: false } };
}

/**
 * Lịch xe trong khu tài khoản — import THẲNG `CalendarScheduler`, không fork.
 *
 * Trang chiếm TRỌN bề ngang: `AccountShell` nhận ra đường dẫn này và tạm ẩn menu trái (lưới lịch
 * cần từng pixel ngang — nhường 256px cho menu là cắt mất khoảng hai ngày khỏi tầm nhìn). Lối
 * quay lại vì thế phải nằm ngay trên tiêu đề, không thể trông chờ vào menu đang ẩn.
 *
 * Toàn bộ khoảng ngày, event, modal, quyền và cuộn vẫn của lịch dùng chung; trang chỉ cấp cho nó
 * một cột dọc có chiều cao viewport (`calendar-page.module.css`), giống cách `AppShell` khoá
 * viewport cho `/manage/calendar`.
 */
export default async function AccountCalendarPage() {
  const t = await getTranslations('Account.calendar');

  return (
    <OwnerGate>
      <div className={styles.page}>
        <AccountPageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          back={{ href: ROUTES.ACCOUNT.VEHICLES, label: t('back') }}
        />
        <div className={styles.scheduler}>
          <Suspense fallback={<LoadingState variant="page" />}>
            <CalendarScheduler />
          </Suspense>
        </div>
      </div>
    </OwnerGate>
  );
}
