'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useZone } from '@/zones/ZoneProvider';
import { zonePath } from '@/zones/zone-config';
import { EmptyState } from './EmptyState';
import styles from './StatePage.module.css';

export type StatePageKind = 'not-found' | 'error' | 'maintenance' | 'coming-soon' | 'no-results';

const KEY: Record<
  StatePageKind,
  'notFound' | 'error' | 'maintenance' | 'comingSoon' | 'noResults'
> = {
  'not-found': 'notFound',
  error: 'error',
  maintenance: 'maintenance',
  'coming-soon': 'comingSoon',
  'no-results': 'noResults',
};

/**
 * Trang trạng thái CẢ MÀN — Figma "States Page" `22306:65271` (404 · Lỗi hệ thống · Bảo trì · Sắp
 * ra mắt): nền gray-25, đệm 40/120/128, khối `EmptyState` chung + nút vàng "← Về trang chủ" về
 * trang chủ của ĐÚNG site đang đứng (khách · partner · quản trị).
 *
 * Dùng chung cho `not-found.tsx` / `error.tsx` của mọi nhóm route và cho mọi tính năng chưa mở —
 * không màn nào tự vẽ trang 404/lỗi riêng.
 */
export function StatePage({
  kind,
  title,
  description,
  onRetry,
}: {
  kind: StatePageKind;
  /** Bỏ trống ⇒ câu chung của bản vẽ. */
  title?: string;
  description?: string;
  /** Chỉ trang lỗi: thử lại (vd. `reset` của `error.tsx`). */
  onRetry?: () => void;
}) {
  const t = useTranslations('Common.statePages');
  const zone = useZone();

  return (
    <section className={styles.page}>
      <EmptyState
        variant={kind}
        title={title ?? t(`${KEY[kind]}.title`)}
        description={description ?? t(`${KEY[kind]}.description`)}
        {...(onRetry ? { onRetry } : {})}
        action={
          <CtaButton href={zonePath(zone, '/')} iconStart={<ArrowLeftOutlined aria-hidden />}>
            {t('backHome')}
          </CtaButton>
        }
      />
    </section>
  );
}
