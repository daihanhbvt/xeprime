'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRef, type ReactNode } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import {
  OtpCodeEntry,
  submitCodeOrFocus,
} from '@/features/phone-verification/components/OtpCodeEntry';
import { formatOtpCooldown } from '@/features/phone-verification/format-cooldown';
import type { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhoneStars } from '@/features/phone-verification/mask';
import { cx } from '@/lib/cx';
import { CloseIcon } from './AuthIcons';
import styles from './MarketAuth.module.css';

interface VerifyAccountDialogProps {
  open: boolean;
  /** Số vừa nhận mã — hiện ở dạng che "037 *** *789". */
  phone: string;
  /** Máy gửi mã `register` của lượt đăng ký — gửi lại mã và đếm ngược đi qua nó. */
  verify: ReturnType<typeof usePhoneVerify>;
  code: string;
  onCodeChange: (code: string) => void;
  /** Bấm "Xác minh" hoặc gõ đủ 6 số. */
  onSubmit: (code: string) => void;
  submitting: boolean;
  /** Lỗi của lượt tạo tài khoản (mã sai, hết hạn…) — đã dịch từ MÃ lỗi. */
  error: string | null;
  /** Đóng popup = quay lại form đăng ký, thứ đã điền còn nguyên. */
  onClose: () => void;
}

/**
 * Popup "XÁC MINH TÀI KHOẢN" của đăng ký (design v2, Figma `19836:34990`) — nổi trên hộp đăng ký.
 *
 * Chỉ là giao diện của MỘT mã đã gửi: sáu ô mã, "Gửi lại mã (00:58)", nút "Xác minh". Việc mã đó
 * mở ra cái gì (tạo tài khoản + cấp phiên) thuộc về `useAuthFlow` — ở đây không có lời gọi API
 * nào ngoài gửi lại mã. Gõ đủ sáu số là tự gửi, như mọi ô mã của XePrime.
 */
export function VerifyAccountDialog({
  open,
  phone,
  verify,
  code,
  onCodeChange,
  onSubmit,
  submitting,
  error,
  onClose,
}: VerifyAccountDialogProps) {
  const t = useTranslations('Auth.market.verify');
  const codeRef = useRef<HTMLInputElement>(null);

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      hideHeaderTitle
      ariaLabel={t('title')}
      size="fit"
      mobileMode="sheet"
      footer={null}
      // Đang tạo tài khoản thì không đóng vô ý — lượt gọi vẫn chạy, đóng giữa chừng là mất kết quả.
      confirmLoading={submitting}
      closeIcon={<CloseIcon width={24} height={24} />}
      // Popup chồng lên hộp đăng ký: focus ô mã khi popup mở xong (xem `afterOpenChange`).
      afterOpenChange={(opened) => {
        if (opened) codeRef.current?.focus();
      }}
      className={styles.popup}
      bodyClassName={styles.popupBody}
    >
      <div className={styles.verify}>
        <Image
          src="/auth/verify-shield.webp"
          alt=""
          width={120}
          height={120}
          className={styles.illustration}
        />
        <div className={styles.centerHeader}>
          <h2 className={cx(styles.title, styles.caps)}>{t('title')}</h2>
          <p className={styles.sub}>
            {t.rich('body', {
              br: () => <br />,
              b: (chunks: ReactNode) => <span className={styles.phone}>{chunks}</span>,
              phone: maskPhoneStars(phone),
            })}
          </p>
        </div>

        <OtpCodeEntry
          inputRef={codeRef}
          value={code}
          onChange={onCodeChange}
          onComplete={onSubmit}
          submitting={submitting}
          error={error ?? verify.error}
          devCode={verify.devCode}
        />

        <p className={styles.resendLine}>
          <button
            type="button"
            className={styles.resendButton}
            disabled={verify.cooldown > 0 || verify.sending || submitting}
            onClick={() => verify.send(phone)}
          >
            {verify.cooldown > 0
              ? t('resendIn', { time: formatOtpCooldown(verify.cooldown) })
              : t('resend')}
          </button>
        </p>

        <div className={cx(styles.submitBlock, styles.submitBlockSpaced)}>
          <CtaButton
            size="form"
            block
            loading={submitting}
            onClick={() => submitCodeOrFocus(code, codeRef, onSubmit)}
          >
            {t('submit')}
          </CtaButton>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
