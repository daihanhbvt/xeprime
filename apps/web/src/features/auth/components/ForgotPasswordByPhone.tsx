'use client';

import { CheckCircleFilled, LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import {
  buildForgotPasswordPhoneSchema,
  buildResetPasswordSchema,
  type ForgotPasswordPhoneValues,
  type ResetPasswordValues,
} from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { zoneAuthRoutes } from '@/constants/routes';
import { OtpCodeStep } from '@/features/phone-verification/components/OtpCodeStep';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { useErrorMessage } from '@/i18n/use-error-message';
import { resetPasswordWithOtp } from '@/services/auth.service';
import { useZone } from '@/zones/ZoneProvider';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import styles from './AuthCard.module.css';

type Step = 'phone' | 'code' | 'done';

/**
 * Quên mật khẩu bằng SỐ ĐIỆN THOẠI — site khách và site partner (ADR 0060).
 *
 * Ba bước: SĐT → mã OTP `password_reset` + mật khẩu mới → xong. Không giả định tài khoản có
 * email; tài khoản Google/Facebook hay tài khoản cũ chưa có mật khẩu cũng đặt được mật khẩu ở đây.
 *
 * Hai điều cố ý:
 *  - Câu ở bước mã nói "NẾU số này có tài khoản…": server trả như nhau dù số có tài khoản hay
 *    không (và chỉ thật sự nhắn tin khi có), nên giao diện cũng không được khẳng định điều đó.
 *  - Xong là XONG, không tự đăng nhập: mã chỉ mở quyền đổi mật khẩu. Người dùng đăng nhập lại
 *    bằng SĐT + mật khẩu vừa đặt — đúng cái cửa duy nhất mà sản phẩm còn mở.
 */
export function ForgotPasswordByPhone() {
  const t = useTranslations('Auth');
  const routes = zoneAuthRoutes(useZone());
  const errorMessage = useErrorMessage();
  const labels = useAuthSchemaLabels();
  const otp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const phoneSchema = useMemo(() => buildForgotPasswordPhoneSchema(labels), [labels]);
  const phoneForm = useForm<ForgotPasswordPhoneValues>({
    resolver: yupResolver(phoneSchema),
    defaultValues: { phone: '' },
  });
  const passwordSchema = useMemo(() => buildResetPasswordSchema(labels), [labels]);
  const passwordForm = useForm<ResetPasswordValues>({
    resolver: yupResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const sendCode = phoneForm.handleSubmit(async (values) => {
    if (sending) return;
    const target = values.phone.trim();
    setSending(true);
    setError(null);
    try {
      // Môi trường nhận mã test: sang thẳng bước mã, không tốn SMS (bấm "Gửi mã" để nhận mã thật).
      if (!otp.testCodeEnabled) await otp.sendAsync(target);
      setPhone(target);
      setCode('');
      setStep('code');
    } catch {
      // Lỗi gửi (cooldown, quá số lần) hiện qua `otp.error` ngay trên form.
    } finally {
      setSending(false);
    }
  });

  function submitReset(submitted: string) {
    void passwordForm.handleSubmit(async (values) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await resetPasswordWithOtp({ phone, code: submitted, password: values.password });
        setStep('done');
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function editPhone() {
    setStep('phone');
    setCode('');
    setError(null);
    otp.reset();
  }

  if (step === 'done') {
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
          <div className={styles.title}>
            {step === 'phone' ? t('forgotPassword.title') : t('forgotPhone.codeTitle')}
          </div>
          <div className={styles.sub}>
            {step === 'phone' ? t('forgotPhone.subtitle') : t('forgotPhone.codeSubtitle')}
          </div>
        </div>
      </div>

      {step === 'phone' ? (
        <>
          {otp.error ? (
            <Alert type="error" showIcon title={otp.error} className={styles.alert} role="alert" />
          ) : null}
          <form onSubmit={sendCode} noValidate>
            <TextField
              control={phoneForm.control}
              name="phone"
              label={t('login.phone')}
              type="tel"
              placeholder={t('login.phonePlaceholder')}
              autoComplete="tel"
              prefix={<PhoneOutlined />}
              autoFocus
            />
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              className={styles.submit}
              loading={sending}
            >
              {t('forgotPhone.sendCode')}
            </Button>
          </form>
        </>
      ) : (
        <OtpCodeStep
          phone={phone}
          verify={otp}
          code={code}
          onCodeChange={(next) => {
            if (error) setError(null);
            setCode(next);
          }}
          onSubmit={submitReset}
          submitLabel={t('resetPassword.submit')}
          submitting={submitting}
          onEdit={editPhone}
          editLabel={t('otp.editPhone')}
          sentHint={t('forgotPhone.sentHint', { phone: maskPhone(phone) })}
          error={error}
        >
          <TextField
            control={passwordForm.control}
            name="password"
            label={t('resetPassword.newPassword')}
            type="password"
            placeholder={t('resetPassword.newPasswordPlaceholder')}
            autoComplete="new-password"
            prefix={<LockOutlined />}
          />
          <TextField
            control={passwordForm.control}
            name="confirmPassword"
            label={t('resetPassword.confirmPassword')}
            type="password"
            placeholder={t('resetPassword.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            prefix={<LockOutlined />}
          />
        </OtpCodeStep>
      )}

      <div className={styles.footer}>
        <Link href={routes.login}>{t('links.backToLogin')}</Link>
      </div>
    </div>
  );
}
