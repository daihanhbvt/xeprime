'use client';

import { Alert, Button } from 'antd';
import { CheckCircleFilled, MailOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { forgotPassword } from '@/services/auth.service';
import { getErrorMessage } from '@/services/api-client';
import styles from '../auth-card.module.css';

export default function ForgotPasswordPage() {
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
      setError(getErrorMessage(err));
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
          <div className={styles.title}>Kiểm tra email của bạn</div>
          <p className={styles.sub}>
            Nếu <b>{sentTo}</b> có tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu. Liên kết
            hết hạn sau 1 giờ.
          </p>
        </div>
        <div className={styles.footer}>
          <Link href={ROUTES.LOGIN}>Quay lại đăng nhập</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <Logo size="lg" />
        <div>
          <div className={styles.title}>Quên mật khẩu</div>
          <div className={styles.sub}>Nhập email, chúng tôi gửi liên kết đặt lại mật khẩu</div>
        </div>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="email"
          label="Email"
          type="email"
          placeholder="ban@congty.vn"
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
          Gửi liên kết đặt lại
        </Button>
      </form>

      <div className={styles.footer}>
        <Link href={ROUTES.LOGIN}>Quay lại đăng nhập</Link>
      </div>
    </div>
  );
}
