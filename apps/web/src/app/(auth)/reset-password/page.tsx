'use client';

import { Alert, Button } from 'antd';
import { CheckCircleFilled, LockOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordValues } from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { resetPassword } from '@/services/auth.service';
import { getErrorMessage } from '@/services/api-client';
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
      setError(getErrorMessage(err));
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
            <div className={styles.title}>Liên kết không hợp lệ</div>
            <div className={styles.sub}>Thiếu mã đặt lại. Hãy yêu cầu liên kết mới.</div>
          </div>
        </div>
        <Link href={ROUTES.FORGOT_PASSWORD}>
          <Button type="primary" block size="large" className={styles.submit}>
            Yêu cầu liên kết mới
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
          <div className={styles.title}>Đã đổi mật khẩu</div>
          <p className={styles.sub}>Bạn có thể đăng nhập bằng mật khẩu mới.</p>
        </div>
        <Link href={ROUTES.LOGIN}>
          <Button type="primary" block size="large" className={styles.submit}>
            Đăng nhập
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
          <div className={styles.title}>Đặt mật khẩu mới</div>
          <div className={styles.sub}>Nhập mật khẩu mới cho tài khoản của bạn</div>
        </div>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="password"
          label="Mật khẩu mới"
          type="password"
          placeholder="Tối thiểu 8 ký tự, có chữ và số"
          autoComplete="new-password"
          prefix={<LockOutlined />}
          autoFocus
        />
        <TextField
          control={control}
          name="confirmPassword"
          label="Nhập lại mật khẩu"
          type="password"
          placeholder="Nhập lại mật khẩu"
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
          Đặt lại mật khẩu
        </Button>
      </form>

      <div className={styles.footer}>
        <Link href={ROUTES.LOGIN}>Quay lại đăng nhập</Link>
      </div>
    </div>
  );
}
