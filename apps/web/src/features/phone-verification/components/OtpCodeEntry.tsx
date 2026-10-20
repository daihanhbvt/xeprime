'use client';

import { useTranslations } from 'next-intl';
import { useId, type RefObject } from 'react';
import { OTP_POLICY } from '@xeprime/types';
import { OtpDigitBoxes } from './OtpDigitBoxes';
import styles from './OtpCodeEntry.module.css';

interface OtpCodeEntryProps {
  value: string;
  onChange: (code: string) => void;
  /** Gõ (hoặc dán) đủ số — gửi luôn. */
  onComplete: (code: string) => void;
  /** Đang gửi mã đi: khoá gõ, giữ focus. */
  submitting: boolean;
  /** Lỗi của lượt gửi mã / gửi lại — đã dịch từ MÃ lỗi. */
  error: string | null;
  /** Mã dev của provider mock (dev/staging) — production luôn `null`. */
  devCode: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
}

/**
 * Khối NHẬP MÃ của design v2 — sáu ô, câu lỗi đọc kèm ô (`aria-describedby`), mã dev. Dùng chung cho
 * popup "Xác minh tài khoản" (đăng ký) và bước "Nhập mã OTP" (quên mật khẩu): hai màn khác chữ, khác
 * minh hoạ, cùng một cách nhập mã.
 */
export function OtpCodeEntry({
  value,
  onChange,
  onComplete,
  submitting,
  error,
  devCode,
  inputRef,
  autoFocus,
}: OtpCodeEntryProps) {
  const t = useTranslations('Auth.otp');
  const errorId = useId();

  return (
    <div className={styles.entry}>
      <OtpDigitBoxes
        inputRef={inputRef}
        value={value}
        onChange={onChange}
        onComplete={(full) => {
          if (!submitting) onComplete(full);
        }}
        readOnly={submitting}
        invalid={error !== null}
        describedBy={error ? errorId : undefined}
        autoFocus={autoFocus}
      />
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {devCode ? <p className={styles.devHint}>{t('devCode', { code: devCode })}</p> : null}
    </div>
  );
}

/**
 * Nút gửi của bản vẽ luôn sáng: mã đủ số thì gửi, chưa đủ thì đưa con trỏ về ô mã — không gửi một
 * mã thiếu chỉ để nhận câu "sai mã".
 */
export function submitCodeOrFocus(
  code: string,
  inputRef: RefObject<HTMLInputElement | null>,
  onSubmit: (code: string) => void,
): void {
  if (code.length !== OTP_POLICY.CODE_LENGTH) {
    inputRef.current?.focus();
    return;
  }
  onSubmit(code);
}
