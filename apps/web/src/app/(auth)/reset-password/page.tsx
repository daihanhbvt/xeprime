'use client';

import { Alert, Button } from 'antd';
import { CheckCircleFilled, LockOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordValues } from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { resetPassword } from '@/services/auth.service';
import { useErrorMessage } from '@/i18n/use-error-message';
import styles from '../auth-card.module.css';

export default function ResetPasswordPage() {
  // useSearchParams cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      await resetPassword(token, values.password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  });

  // Link hỏng / thiếu token.
  if (!token) {
    return (
      <div className={styles.box}>
        <div className={styles.head}>
          <Logo size="lg" />
          <div>
            <div className={styles.title}>{t('resetPassword.invalidTitle')}</div>
            <div className={styles.sub}>{t('resetPassword.invalidSubtitle')}</div>
          </div>
        </div>
        <Link href={ROUTES.FORGOT_PASSWORD}>
          <Button type="primary" block size="large" className={styles.submit}>
            {t('resetPassword.requestNew')}
          </Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.box}>
        <div className={styles.success}>
          <Logo size="lg" />
          <CheckCircleFilled className={styles.successIcon} />
          <div className={styles.title}>{t('resetPassword.doneTitle')}</div>
          <p className={styles.sub}>{t('resetPassword.doneSubtitle')}</p>
        </div>
        <Link href={ROUTES.LOGIN}>
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
          <div className={styles.title}>{t('resetPassword.title')}</div>
          <div className={styles.sub}>{t('resetPassword.subtitle')}</div>
        </div>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} className={styles.alert} />
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="password"
          label={t('resetPassword.newPassword')}
          type="password"
          placeholder={t('resetPassword.newPasswordPlaceholder')}
          autoComplete="new-password"
          prefix={<LockOutlined />}
          autoFocus
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
          loading={pending}
        >
          {t('resetPassword.submit')}
        </Button>
      </form>

      <div className={styles.footer}>
        <Link href={ROUTES.LOGIN}>{t('links.backToLogin')}</Link>
      </div>
    </div>
  );
}
