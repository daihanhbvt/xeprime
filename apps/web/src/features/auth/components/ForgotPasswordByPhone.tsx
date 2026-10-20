'use client';

import { CheckCircleFilled, LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import {
  buildResetPasswordByPhoneSchema,
  type ResetPasswordByPhoneValues,
} from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { zoneAuthRoutes } from '@/constants/routes';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { useErrorMessage } from '@/i18n/use-error-message';
import { resetPasswordWithOtp } from '@/services/auth.service';
import { useZone } from '@/zones/ZoneProvider';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import styles from './AuthCard.module.css';
import otpStyles from './ForgotPasswordByPhone.module.css';

const isOtpCodeComplete = (code: string): boolean => /^[0-9]{6}$/.test(code);

/**
 * Quên mật khẩu bằng SỐ ĐIỆN THOẠI — site PARTNER (ADR 0060). MỘT màn, giống hệt app native
 * (`ForgotPasswordScreen`). Site khách quên mật khẩu ba bước ngay trong hộp tài khoản
 * (`MarketForgotPassword`, design v2) — cùng endpoint, `/forgot-password` của site khách chuyển về đó:
 *
 *   SĐT · mật khẩu mới · nhập lại → "Xác nhận" → gửi mã `password_reset` + popup nhập mã →
 *   đúng mã ⇒ `POST /auth/password/reset-otp` → "Đã đặt lại mật khẩu".
 *
 * Hai điều cố ý:
 *  - Câu trong popup nói "NẾU số này có tài khoản…": server trả như nhau dù số có tài khoản hay
 *    không (và chỉ thật sự nhắn tin khi có), nên giao diện cũng không được khẳng định điều đó. Số
 *    không có tài khoản thì lượt đặt lại trả `OTP_INVALID`, y như sai mã.
 *  - Xong là XONG, không tự đăng nhập: mã chỉ mở quyền đổi mật khẩu. Người dùng đăng nhập lại
 *    bằng SĐT + mật khẩu vừa đặt.
 */
export function ForgotPasswordByPhone() {
  const t = useTranslations('Auth');
  const tCommon = useTranslations('Common.actions');
  const routes = zoneAuthRoutes(useZone());
  const errorMessage = useErrorMessage();
  const labels = useAuthSchemaLabels();
  const otp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET);

  /** Giá trị form của lượt đang chờ mã — popup mở khi khác null. */
  const [draft, setDraft] = useState<ResetPasswordByPhoneValues | null>(null);
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const schema = useMemo(() => buildResetPasswordByPhoneSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<ResetPasswordByPhoneValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: '', password: '', confirmPassword: '' },
  });

  /** "Xác nhận": gửi mã rồi mở popup. Môi trường nhận mã test thì không tốn SMS. */
  const confirm = async (values: ResetPasswordByPhoneValues) => {
    if (sending) return;
    setSending(true);
    try {
      if (!otp.testCodeEnabled) await otp.sendAsync(values.phone.trim());
      setCode('');
      setOtpError(null);
      setDraft(values);
    } catch {
      // Cooldown, quá số lần gửi… hiện qua `otp.error` ngay trên form.
    } finally {
      setSending(false);
    }
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => void handleSubmit(confirm)(event);

  const reset = async (value: string) => {
    if (!draft || submitting || !isOtpCodeComplete(value)) return;
    setSubmitting(true);
    setOtpError(null);
    try {
      await resetPasswordWithOtp({
        phone: draft.phone.trim(),
        code: value,
        password: draft.password,
      });
      setDraft(null);
      setDone(true);
    } catch (err) {
      // Sai/hết hạn mã: ở lại popup cho nhập lại.
      setOtpError(errorMessage(err));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!draft) return;
    setOtpError(null);
    try {
      await otp.sendAsync(draft.phone.trim());
      setCode('');
    } catch (err) {
      setOtpError(errorMessage(err));
    }
  };

  if (done) {
    return (
      <div className={styles.box}>
        <div className={styles.success}>
          <Logo size="lg" />
          <CheckCircleFilled className={styles.successIcon} />
          <div className={styles.title}>{t('forgotPhone.doneTitle')}</div>
          <p className={styles.sub}>{t('forgotPhone.doneBody')}</p>
        </div>
        <Link href={routes.login}>
          <Button type="primary" block size="large" className={styles.submit}>
            {t('links.login')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <Logo size="lg" />
        <div>
          <div className={styles.title}>{t('forgotPassword.title')}</div>
          <div className={styles.sub}>{t('forgotPhone.subtitle')}</div>
        </div>
      </div>

      {otp.error && !draft ? (
        <Alert type="error" showIcon title={otp.error} className={styles.alert} role="alert" />
      ) : null}
      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="phone"
          label={t('login.phone')}
          type="tel"
          placeholder={t('login.phonePlaceholder')}
          autoComplete="tel"
          prefix={<PhoneOutlined />}
          autoFocus
        />
        <TextField
          control={control}
          name="password"
          label={t('resetPassword.newPassword')}
          type="password"
          placeholder={t('resetPassword.newPasswordPlaceholder')}
          autoComplete="new-password"
          prefix={<LockOutlined />}
        />
        <TextField
          control={control}
          name="confirmPassword"
          label={t('resetPassword.confirmPassword')}
          type="password"
          placeholder={t('resetPassword.confirmPasswordPlaceholder')}
          autoComplete="new-password"
          prefix={<LockOutlined />}
        />
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          className={styles.submit}
          loading={sending}
        >
          {tCommon('confirm')}
        </Button>
      </form>

      <div className={styles.footer}>
        <Link href={routes.login}>{t('links.backToLogin')}</Link>
      </div>

      <ResponsiveDialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={t('register.verifyTitle')}
        size="sm"
        footer={
          <div className={otpStyles.otpFooter}>
            <Button onClick={() => setDraft(null)} disabled={submitting}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!isOtpCodeComplete(code)}
              onClick={() => void reset(code)}
            >
              {t('resetPassword.submit')}
            </Button>
          </div>
        }
      >
        <div className={otpStyles.otpBody}>
          <p className={otpStyles.otpLead}>
            {t('forgotPhone.sentHint', { phone: maskPhone(draft?.phone.trim() ?? '') })}
          </p>
          <OtpCodeInput
            value={code}
            onChange={(next) => {
              if (otpError) setOtpError(null);
              setCode(next);
            }}
            onComplete={(full) => void reset(full)}
            disabled={submitting}
            autoFocus
          />
          {otpError ? <Alert type="error" showIcon title={otpError} /> : null}
          <div className={otpStyles.otpResend}>
            <Button
              type="link"
              size="small"
              loading={otp.sending}
              disabled={otp.cooldown > 0 || submitting}
              onClick={() => void resend()}
            >
              {otp.cooldown > 0
                ? t('otp.resendIn', { seconds: otp.cooldown })
                : t('otp.resend')}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
