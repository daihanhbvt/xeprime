'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/feedback/EmptyState';
import styles from './AppShell.module.css';

/**
 * Khung không hỏi được `/auth/me` (API đang khởi động lại, quá tần suất, 5xx, mất mạng). Phiên vẫn
 * còn nguyên - chỉ mời thử lại, KHÔNG đẩy ra trang đăng nhập (xem `useShellSession`).
 */
export function ShellSessionUnreachable({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  const t = useTranslations('Common');
  return (
    <div className={styles.centered}>
      <EmptyState
        variant="error"
        title={t('states.error')}
        description={t('states.errorHint')}
        onRetry={retrying ? undefined : onRetry}
        retryLabel={t('actions.retry')}
      />
    </div>
  );
}
