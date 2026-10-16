'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { TickCircleIcon } from './AuthIcons';
import styles from './MarketAuth.module.css';

/**
 * Popup "Thành công!" sau khi đặt lại mật khẩu (design v2, Figma `19836:42218`).
 *
 * Đặt lại mật khẩu KHÔNG cấp phiên (ADR 0060 §4) — popup chỉ đưa khách về form đăng nhập, số điện
 * thoại điền sẵn. Bản vẽ không có nút X: lối ra duy nhất là "Đăng nhập", và Esc / bấm nền cũng đi
 * đúng lối đó — không có trạng thái "đóng popup rồi đứng lại ở màn đặt mật khẩu đã xong".
 */
export function PasswordResetDoneDialog({
  open,
  onLogin,
}: {
  open: boolean;
  onLogin: () => void;
}) {
  const t = useTranslations('Auth.market.forgot.done');

  return (
    <ResponsiveDialog
      open={open}
      onClose={onLogin}
      hideHeaderTitle
      ariaLabel={t('title')}
      size="fit"
      mobileMode="sheet"
      footer={null}
      closable={false}
      className={styles.popup}
      bodyClassName={styles.popupBody}
    >
      <div className={styles.done}>
        <div className={styles.doneHead}>
          <span className={styles.doneIcon}>
            <TickCircleIcon />
          </span>
          <div className={styles.doneText}>
            <h2 className={styles.doneTitle}>{t('title')}</h2>
            <p className={styles.doneBody}>
              {t.rich('body', { strong: (chunks: ReactNode) => <strong>{chunks}</strong> })}
            </p>
          </div>
        </div>
        <CtaButton size="lg" block onClick={onLogin} className={styles.doneButton}>
          {t('submit')}
        </CtaButton>
      </div>
    </ResponsiveDialog>
  );
}
