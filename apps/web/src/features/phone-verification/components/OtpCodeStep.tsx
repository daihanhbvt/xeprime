'use client';

import { Alert, Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { usePhoneVerify } from '../hooks/use-phone-verify';
import { maskPhone } from '../mask';
import { OtpCodeInput } from './OtpCodeInput';
import styles from './OtpCodeStep.module.css';

const OTP_LENGTH = 6;

interface OtpCodeStepProps {
  /** Số đã (hoặc sẽ) nhận mã — hiện ở dạng che. */
  phone: string;
  /** Máy trạng thái gửi mã của luồng đang dùng — đúng MỤC ĐÍCH của mã (ADR 0060). */
  verify: ReturnType<typeof usePhoneVerify>;
  code: string;
  onCodeChange: (code: string) => void;
  /** Bấm nút chính, hoặc gõ đủ 6 số. */
  onSubmit: (code: string) => void;
  submitLabel: string;
  submitting: boolean;
  /** Quay lại sửa số / thông tin — mã đã gửi vẫn tính cooldown ở server. */
  onEdit: () => void;
  editLabel: string;
  /**
   * Câu dẫn khi mã ĐÃ gửi. Mặc định "Mã đã gửi tới …"; quên mật khẩu truyền câu riêng vì nó
   * không được khẳng định số đó có tài khoản.
   */
  sentHint?: ReactNode;
  /** Lỗi của bước gửi đi (đăng ký / đặt lại mật khẩu) — đã dịch từ MÃ lỗi. */
  error?: string | null;
  /** Ô phụ dưới ô mã (vd mật khẩu mới) — cùng một lần bấm nút chính. */
  children?: ReactNode;
  /** Nút chính chỉ mở khi phần phụ cũng sẵn sàng. */
  canSubmit?: boolean;
}

/**
 * Bước NHẬP MÃ OTP dùng chung — đăng ký tài khoản và quên mật khẩu (ADR 0060).
 *
 * Chỉ là phần giao diện của một mã đã gửi: ô mã, đếm ngược gửi lại, "sửa số", mã dev/mã test.
 * Việc mã đó MỞ ra cái gì (tạo tài khoản, đổi mật khẩu) thuộc về nơi gọi — component này không
 * gọi API nào ngoài gửi lại mã qua `verify.send`. Không có nhánh nào ở đây phát phiên đăng nhập.
 *
 * Môi trường nhận mã test (dev/staging): mã chưa gửi vẫn nhập được — gõ mã test là qua.
 */
export function OtpCodeStep({
  phone,
  verify,
  code,
  onCodeChange,
  onSubmit,
  submitLabel,
  submitting,
  onEdit,
  editLabel,
  sentHint,
  error,
  children,
  canSubmit = true,
}: OtpCodeStepProps) {
  const t = useTranslations('Auth.otp');
  const sent = verify.status === 'code_sent';
  const ready = code.length === OTP_LENGTH && canSubmit && !submitting;
  const displayError = error ?? verify.error;

  return (
    <div className={styles.wrap}>
      {displayError ? (
        <Alert type="error" showIcon title={displayError} className={styles.err} role="alert" />
      ) : null}

      <Form.Item
        label={t('code')}
        className={styles.item}
        help={
          sent
            ? (sentHint ?? t('codeHint', { phone: maskPhone(phone) }))
            : verify.testCodeEnabled
              ? t('testCodeHint')
              : undefined
        }
      >
        <OtpCodeInput
          value={code}
          onChange={onCodeChange}
          // Gõ đủ 6 số thì tự gửi — trừ khi bước còn ô khác (mật khẩu mới) chưa điền.
          onComplete={(full) => {
            if (!children && canSubmit && !submitting) onSubmit(full);
          }}
          autoFocus
          disabled={submitting}
        />
      </Form.Item>

      {verify.devCode ? (
        <div className={styles.devHint}>{t('devCode', { code: verify.devCode })}</div>
      ) : null}

      {children}

      <Button
        type="primary"
        block
        size="large"
        className={styles.submit}
        loading={submitting}
        disabled={!ready}
        onClick={() => onSubmit(code)}
      >
        {submitLabel}
      </Button>

      <div className={styles.footRow}>
        <button type="button" className={styles.linkBtn} disabled={submitting} onClick={onEdit}>
          {editLabel}
        </button>
        <button
          type="button"
          className={styles.linkBtn}
          disabled={verify.cooldown > 0 || verify.sending || submitting}
          onClick={() => verify.send(phone)}
        >
          {verify.cooldown > 0
            ? t('resendIn', { seconds: verify.cooldown })
            : sent
              ? t('resend')
              : t('sendCode')}
        </button>
      </div>
    </div>
  );
}
