'use client';

import { Alert, Button } from 'antd';
import { CheckCircleFilled, MailOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { forgotPassword } from '@/services/auth.service';
import { useErrorMessage } from '@/i18n/use-error-message';
import styles from '../auth-card.module.css';

export default function ForgotPasswordPage() {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<ForgotPasswordValues>({
    resolver: yupResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setPending(true);
    setError(null);
    try {
      await forgotPassword(values.email);
      // Luôn báo thành công dù email có tồn tại hay không (backend cũng vậy).
      setSentTo(values.email);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  });

  if (sentTo) {
    return (
      <div className={styles.box}>
        <div className={styles.success}>
          <Logo size="lg" />
          <CheckCircleFilled className={styles.successIcon} />
          <div className={styles.title}>{t('forgotPassword.sentTitle')}</div>
          {/*
            Câu có phần in đậm ở GIỮA — dựng bằng rich text của ICU, không nối ba mảnh
            chuỗi: vị trí của địa chỉ email trong câu khác nhau giữa hai ngôn ngữ.
          */}
          <p className={styles.sub}>
            {t.rich('forgotPassword.sentBody', {
              email: sentTo,
              strong: (chunks) => <b>{chunks}</b>,
            })}
          </p>
        </div>
        <div className={styles.footer}>
          <Link href={ROUTES.LOGIN}>{t('links.backToLogin')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <Logo size="lg" />
        <div>
          <div className={styles.title}>{t('forgotPassword.title')}</div>
          <div className={styles.sub}>{t('forgotPassword.subtitle')}</div>
        </div>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} className={styles.alert} />
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="email"
          label={t('fields.email')}
          type="email"
          placeholder={t('fields.emailPlaceholder')}
          autoComplete="email"
          prefix={<MailOutlined />}
          autoFocus
        />
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          className={styles.submit}
          loading={pending}
        >
          {t('forgotPassword.submit')}
        </Button>
      </form>

      <div className={styles.footer}>
        <Link href={ROUTES.LOGIN}>{t('links.backToLogin')}</Link>
      </div>
    </div>
  );
}
