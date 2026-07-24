'use client';

import { Alert, Button, Divider } from 'antd';
import { FacebookFilled, GoogleOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { loginSchema, type LoginValues } from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  createSession,
  getProviderIdToken,
  loginWithPassword,
  type AuthProvider,
} from '@/services/auth.service';
import { getErrorMessage } from '@/services/api-client';
import styles from './login.module.css';

export default function LoginPage() {
  // useSearchParams (đọc ?next=) cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: yupResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  /** Đích quay lại sau đăng nhập (proxy đặt `?next=`), mặc định vào khu quản lý. */
  function nextUrl(): string {
    const next = search.get('next');
    return next && next.startsWith('/') ? next : ROUTES.MANAGE.ROOT;
  }

  async function afterAuth() {
    await queryClient.invalidateQueries();
    router.replace(nextUrl());
  }

  const onSubmit = handleSubmit(async (values) => {
    setPending('password');
    setError(null);
    try {
      await loginWithPassword(values.email, values.password);
      await afterAuth();
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(null);
    }
  });

  async function signInWithProvider(provider: AuthProvider) {
    setPending(provider);
    setError(null);
    try {
      const idToken = await getProviderIdToken(provider);
      await createSession(idToken);
      await afterAuth();
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <Logo size="lg" />
        <div>
          <div className={styles.title}>Đăng nhập XePrime</div>
          <div className={styles.sub}>Quản lý gian hàng cho thuê xe</div>
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
        <TextField
          control={control}
          name="password"
          label="Mật khẩu"
          type="password"
          placeholder="Mật khẩu"
          autoComplete="current-password"
          prefix={<LockOutlined />}
        />
        <div className={styles.rowBetween}>
          <Link href={ROUTES.FORGOT_PASSWORD} className={styles.link}>
            Quên mật khẩu?
          </Link>
        </div>
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          className={styles.submit}
          loading={pending === 'password'}
          disabled={busy && pending !== 'password'}
        >
          Đăng nhập
        </Button>
      </form>

      <div className={styles.registerHint}>
        Chưa có tài khoản? <Link href={ROUTES.REGISTER}>Đăng ký</Link>
      </div>

      <Divider className={styles.divider} plain>
        hoặc
      </Divider>

      <div className={styles.oauth}>
        <Button
          className={styles.oauthBtn}
          icon={<GoogleOutlined />}
          block
          loading={pending === AUTH_PROVIDER.GOOGLE}
          disabled={busy && pending !== AUTH_PROVIDER.GOOGLE}
          onClick={() => void signInWithProvider(AUTH_PROVIDER.GOOGLE)}
        >
          {AUTH_PROVIDER_LABEL[AUTH_PROVIDER.GOOGLE]}
        </Button>
        <Button
          className={styles.oauthBtn}
          icon={<FacebookFilled />}
          block
          loading={pending === AUTH_PROVIDER.FACEBOOK}
          disabled={busy && pending !== AUTH_PROVIDER.FACEBOOK}
          onClick={() => void signInWithProvider(AUTH_PROVIDER.FACEBOOK)}
        >
          {AUTH_PROVIDER_LABEL[AUTH_PROVIDER.FACEBOOK]}
        </Button>
      </div>
    </div>
  );
}
