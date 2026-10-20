'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { API_ERROR_CODE, compactPhoneInput, OTP_POLICY } from '@xeprime/types';
import {
  buildLoginPhoneSchema,
  buildResetPasswordSchema,
  type ResetPasswordValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import {
  OtpCodeEntry,
  submitCodeOrFocus,
} from '@/features/phone-verification/components/OtpCodeEntry';
import { formatOtpCooldown } from '@/features/phone-verification/format-cooldown';
import type { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhoneStars } from '@/features/phone-verification/mask';
import { useErrorCodeMessage, useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { ApiClientError } from '@/services/api-client';
import { resetPasswordWithOtp } from '@/services/auth.service';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import { LockIcon, passwordVisibilityIcon, UserIcon } from './AuthIcons';
import { PasswordResetDoneDialog } from './PasswordResetDoneDialog';
import styles from './MarketAuth.module.css';

/** Ba bước của bản vẽ — cũng là ba vạch của thanh tiến trình. */
const FORGOT_STEP = { PHONE: 1, CODE: 2, PASSWORD: 3 } as const;
type ForgotStep = (typeof FORGOT_STEP)[keyof typeof FORGOT_STEP];
const STEPS: readonly ForgotStep[] = [FORGOT_STEP.PHONE, FORGOT_STEP.CODE, FORGOT_STEP.PASSWORD];

/**
 * Lỗi nói rằng MÃ không còn mở được việc đổi mật khẩu (sai, hết hạn, đã dùng, bị khoá vì đoán sai,
 * quá cửa sổ sau khi xác minh). Gặp ở bước đặt mật khẩu ⇒ đưa khách về bước nhập mã, không để họ
 * gõ lại mật khẩu lần nữa vào một mã đã chết.
 */
const DEAD_CODE_ERRORS = new Set<string>([
  API_ERROR_CODE.OTP_INVALID,
  API_ERROR_CODE.OTP_EXPIRED,
  API_ERROR_CODE.OTP_LOCKED,
]);

type Busy = 'send' | 'verify' | 'reset';

export interface MarketForgotPasswordProps {
  /** SĐT đang gõ ở form đăng nhập — điền sẵn bước 1. */
  defaultPhone: string;
  /**
   * Máy gửi mã `password_reset` — do HỘP giữ, không phải bước này: rời sang đăng nhập rồi quay lại
   * thì đồng hồ gửi lại vẫn chạy và mã đã gửi vẫn được nhận, không bị server chặn vì cooldown.
   */
  otp: ReturnType<typeof usePhoneVerify>;
  /** Số đã nhận mã gần nhất (cùng vòng đời với `otp`). */
  sentTo: string | null;
  onCodeSent: (phone: string) => void;
  /** "Quay lại đăng nhập!" (`null`) hoặc "Đăng nhập" sau khi đặt lại xong (SĐT vừa đặt lại). */
  onBackToLogin: (phone: string | null) => void;
  autoFocus: boolean;
}

/**
 * Quên mật khẩu bằng SĐT NGAY TRONG hộp tài khoản site khách — design v2, ba bước + popup
 * (Figma `19836:42239`): nhập SĐT → nhập mã OTP → đặt mật khẩu mới → "Thành công!".
 *
 * Hợp đồng với server (ADR 0060 §4):
 *  - Bước 1 gửi mã `password_reset`. Server trả NHƯ NHAU dù số có tài khoản hay không, nên bước 2
 *    luôn mở — không màn nào ở đây được nói "số này chưa đăng ký".
 *  - Bước 2 xác minh mã (`verify-otp`) trước khi hỏi mật khẩu, để mã sai bị báo NGAY ở bước mã.
 *    Số không có tài khoản không bao giờ nhận được mã, nên cũng không qua được bước này.
 *  - Bước 3 gửi mã đã xác minh + mật khẩu mới (`reset-otp`); server nhận mã đã xác minh trong 10
 *    phút, vẫn đếm lần đoán sai, rồi TIÊU nó. Không cấp phiên — "Đăng nhập" đưa về form đăng nhập,
 *    số điền sẵn.
 *
 * Bước đã qua bấm được trên thanh tiến trình để quay lại (gõ nhầm số, muốn nhập lại mã).
 *
 * Site partner vẫn là màn một bước `ForgotPasswordByPhone` (mã + mật khẩu trong một lượt) — cùng
 * endpoint, chưa ráp theo design v2.
 */
export function MarketForgotPassword({
  defaultPhone,
  otp,
  sentTo,
  onCodeSent,
  onBackToLogin,
  autoFocus,
}: MarketForgotPasswordProps) {
  const errorMessage = useErrorMessage();
  const errorCodeMessage = useErrorCodeMessage();
  const [step, setStep] = useState<ForgotStep>(FORGOT_STEP.PHONE);
  const [phone, setPhone] = useState(() => compactPhoneInput(defaultPhone.trim()));
  const [code, setCode] = useState('');
  /** Mã server đã xác nhận ở bước 2 — quay lại bước 2 rồi bấm tiếp thì không xác minh lại. */
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [done, setDone] = useState(false);

  async function requestCode(nextPhone: string) {
    if (busy) return;
    setError(null);
    // Mã cho đúng số này vừa gửi, còn trong thời gian chờ gửi lại: dùng mã đó, không gửi thêm.
    if (sentTo === nextPhone && otp.cooldown > 0) {
      setPhone(nextPhone);
      setStep(FORGOT_STEP.CODE);
      return;
    }
    setBusy('send');
    try {
      // Môi trường nhận mã test không tốn SMS: sang thẳng bước mã.
      if (!otp.testCodeEnabled) await otp.sendAsync(nextPhone);
      onCodeSent(nextPhone);
      if (nextPhone !== phone) setVerifiedCode(null);
      setPhone(nextPhone);
      setCode('');
      setStep(FORGOT_STEP.CODE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmCode(submitted: string) {
    if (busy || submitted.length !== OTP_POLICY.CODE_LENGTH) return;
    setError(null);
    if (submitted === verifiedCode) {
      setStep(FORGOT_STEP.PASSWORD);
      return;
    }
    setBusy('verify');
    try {
      await otp.verifyAsync(phone, submitted);
      setVerifiedCode(submitted);
      setStep(FORGOT_STEP.PASSWORD);
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Gửi lại mã MỚI. Không đụng tới `verifiedCode`: mã đã xác minh vẫn còn hiệu lực ở server tới hết
   * cửa sổ, và xoá nó ở đây sẽ đánh rơi bước 3 nếu lượt gửi lại về đúng lúc khách đã sang bước 3.
   */
  async function resendCode() {
    if (busy || otp.sending) return;
    setError(null);
    try {
      await otp.sendAsync(phone);
      onCodeSent(phone);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function savePassword(values: ResetPasswordValues) {
    if (busy) return;
    if (!verifiedCode) {
      // Không có mã đã xác minh để đi kèm — về bước mã, nói rõ cần mã mới.
      setStep(FORGOT_STEP.CODE);
      setError(errorCodeMessage(API_ERROR_CODE.OTP_EXPIRED));
      return;
    }
    setError(null);
    setBusy('reset');
    try {
      await resetPasswordWithOtp({ phone, code: verifiedCode, password: values.password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError && DEAD_CODE_ERRORS.has(err.code)) {
        setVerifiedCode(null);
        setCode('');
        setStep(FORGOT_STEP.CODE);
      }
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function goToStep(target: ForgotStep) {
    if (busy) return;
    setError(null);
    setStep(target);
  }

  return (
    <div className={styles.stepPanel}>
      <div className={styles.stepBody}>
        {step === FORGOT_STEP.PHONE ? (
          <PhoneStep
            defaultPhone={phone}
            sending={busy === 'send'}
            error={error}
            autoFocus={autoFocus}
            onSubmit={(value) => void requestCode(value)}
            onBackToLogin={() => onBackToLogin(null)}
          />
        ) : step === FORGOT_STEP.CODE ? (
          <CodeStep
            phone={phone}
            code={code}
            onCodeChange={(next) => {
              if (error) setError(null);
              setCode(next);
            }}
            verifying={busy === 'verify'}
            error={error}
            devCode={otp.devCode}
            cooldown={otp.cooldown}
            resending={otp.sending}
            onSubmit={(value) => void confirmCode(value)}
            onResend={() => void resendCode()}
          />
        ) : (
          <PasswordStep
            saving={busy === 'reset'}
            error={error}
            onSubmit={(values) => void savePassword(values)}
          />
        )}
      </div>

      <StepProgress step={step} disabled={busy !== null} onBack={goToStep} />

      <PasswordResetDoneDialog open={done} onLogin={() => onBackToLogin(phone)} />
    </div>
  );
}

function StepHeader({
  image,
  title,
  caps,
  sub,
}: {
  image: string;
  title: string;
  caps: boolean;
  sub: ReactNode;
}) {
  return (
    <>
      <Image src={image} alt="" width={120} height={120} className={styles.illustration} />
      <div className={styles.centerHeader}>
        <h2 className={cx(styles.title, caps && styles.caps)}>{title}</h2>
        <p className={styles.sub}>{sub}</p>
      </div>
    </>
  );
}

/** Bước 1 — số điện thoại đã đăng ký. */
function PhoneStep({
  defaultPhone,
  sending,
  error,
  autoFocus,
  onSubmit,
  onBackToLogin,
}: {
  defaultPhone: string;
  sending: boolean;
  error: string | null;
  autoFocus: boolean;
  onSubmit: (phone: string) => void;
  onBackToLogin: () => void;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  // Nhận số chép từ danh bạ (có dấu cách/chấm) như ô đăng nhập — gửi đi ở dạng gọn.
  const schema = useMemo(() => yup.object({ phone: buildLoginPhoneSchema(labels) }), [labels]);
  const { control, handleSubmit } = useForm<{ phone: string }>({
    resolver: yupResolver(schema),
    defaultValues: { phone: defaultPhone },
  });

  return (
    <>
      <StepHeader
        image="/auth/forgot-lock.webp"
        title={t('market.forgot.phone.title')}
        caps
        sub={t('market.forgot.phone.sub')}
      />
      <form
        className={styles.form}
        onSubmit={handleSubmit((values) => onSubmit(compactPhoneInput(values.phone.trim())))}
        noValidate
      >
        <div className={cx(styles.fields, styles.bareLabel)}>
          <TextField
            control={control}
            name="phone"
            label={t('login.phone')}
            type="tel"
            placeholder={t('login.phonePlaceholder')}
            autoComplete="tel"
            prefix={<UserIcon className={styles.fieldIcon} />}
            autoFocus={autoFocus}
          />
          {error ? (
            <p className={styles.fieldError} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={styles.submitBlock}>
          <CtaButton type="submit" size="form" block loading={sending}>
            {t('market.forgot.phone.submit')}
          </CtaButton>
          <p className={styles.switchLine}>
            {t('market.forgot.phone.remembered')}
            <button type="button" className={styles.textLink} onClick={onBackToLogin}>
              {t('market.forgot.phone.backToLogin')}
            </button>
          </p>
        </div>
      </form>
    </>
  );
}

/** Bước 2 — sáu ô mã. Gõ đủ sáu số là tự gửi. */
function CodeStep({
  phone,
  code,
  onCodeChange,
  verifying,
  error,
  devCode,
  cooldown,
  resending,
  onSubmit,
  onResend,
}: {
  phone: string;
  code: string;
  onCodeChange: (code: string) => void;
  verifying: boolean;
  error: string | null;
  devCode: string | null;
  cooldown: number;
  resending: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
}) {
  const t = useTranslations('Auth.market.forgot.code');
  const codeRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <StepHeader
        image="/auth/otp-lock.webp"
        title={t('title')}
        caps
        sub={t.rich('sub', {
          br: () => <br />,
          b: (chunks: ReactNode) => <span className={styles.phone}>{chunks}</span>,
          phone: maskPhoneStars(phone),
        })}
      />
      <OtpCodeEntry
        inputRef={codeRef}
        value={code}
        onChange={onCodeChange}
        onComplete={onSubmit}
        submitting={verifying}
        error={error}
        devCode={devCode}
        autoFocus
      />
      <div className={cx(styles.submitBlock, styles.submitBlockSpaced)}>
        <CtaButton
          size="form"
          block
          loading={verifying}
          onClick={() => submitCodeOrFocus(code, codeRef, onSubmit)}
        >
          {t('submit')}
        </CtaButton>
        <p className={styles.switchLine}>
          {t('noCode')}
          <button
            type="button"
            className={styles.textLink}
            disabled={cooldown > 0 || resending || verifying}
            onClick={onResend}
          >
            {cooldown > 0 ? t('resendIn', { time: formatOtpCooldown(cooldown) }) : t('resend')}
          </button>
        </p>
      </div>
    </>
  );
}

/** Bước 3 — mật khẩu mới + xác nhận. */
function PasswordStep({
  saving,
  error,
  onSubmit,
}: {
  saving: boolean;
  error: string | null;
  onSubmit: (values: ResetPasswordValues) => void;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildResetPasswordSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: yupResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  return (
    <>
      <StepHeader
        image="/auth/reset-shield.webp"
        title={t('market.forgot.password.title')}
        caps={false}
        sub={t('market.forgot.password.sub')}
      />
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.fields}>
          <TextField
            control={control}
            name="password"
            label={t('market.forgot.password.newPassword')}
            type="password"
            placeholder={t('market.register.passwordPlaceholder')}
            autoComplete="new-password"
            prefix={<LockIcon className={styles.fieldIcon} />}
            visibilityIcon={passwordVisibilityIcon}
            autoFocus
          />
          <TextField
            control={control}
            name="confirmPassword"
            label={t('market.forgot.password.confirmPassword')}
            type="password"
            placeholder={t('register.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            prefix={<LockIcon className={styles.fieldIcon} />}
            visibilityIcon={passwordVisibilityIcon}
          />
          {error ? (
            <p className={styles.fieldError} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={cx(styles.submitBlock, styles.submitBlockSpaced)}>
          <CtaButton type="submit" size="form" block loading={saving}>
            {t('market.forgot.password.submit')}
          </CtaButton>
        </div>
      </form>
    </>
  );
}

/** Ba vạch neo đáy cột: vạch đã tới tô vàng; vạch của bước ĐÃ QUA bấm được để quay lại. */
function StepProgress({
  step,
  disabled,
  onBack,
}: {
  step: ForgotStep;
  disabled: boolean;
  onBack: (step: ForgotStep) => void;
}) {
  const t = useTranslations('Auth.market.forgot');

  return (
    <div
      className={styles.progress}
      role="group"
      aria-label={t('progress', { current: step, total: STEPS.length })}
    >
      {STEPS.map((n) =>
        n < step ? (
          <button
            key={n}
            type="button"
            className={cx(styles.progressStep, styles.progressDone)}
            aria-label={t('backToStep', { step: n })}
            disabled={disabled}
            onClick={() => onBack(n)}
          />
        ) : (
          <span
            key={n}
            className={cx(styles.progressStep, n === step && styles.progressDone)}
            aria-hidden="true"
          />
        ),
      )}
    </div>
  );
}
