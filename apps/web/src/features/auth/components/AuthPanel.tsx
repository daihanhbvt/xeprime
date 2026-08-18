'use client';

import {
  LockOutlined,
  MailOutlined,
  MobileOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button, Divider, Tabs } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  loginSchema,
  registerSchema,
  type LoginValues,
  type RegisterValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { PhoneLoginForm } from '@/features/phone-verification/components/PhoneLoginForm';
import { getErrorMessage } from '@/services/api-client';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  createSession,
  getProviderIdToken,
  loginWithPassword,
  registerWithPassword,
  type AuthProvider,
  type CurrentUser,
} from '@/services/auth.service';
import { AUTH_MODE, type AuthMode } from '../post-auth-destination';
import { SetPasswordPrompt } from './SetPasswordPrompt';
import { SocialProviderLogo } from './SocialProviderLogo';
import styles from './AuthPanel.module.css';

export interface AuthPanelProps {
  mode: AuthMode;
  /** Đổi giữa Đăng nhập / Đăng ký. Không truyền = ẩn phần chuyển đổi (portal chỉ đăng nhập). */
  onModeChange?: (mode: AuthMode) => void;
  /** Gọi khi phiên đã được cấp. `justRegistered` để chỗ gọi hiện success state riêng. */
  onAuthenticated: (user: CurrentUser, ctx: { justRegistered: boolean }) => void | Promise<void>;
  /** Ẩn tab OTP + social (portal muốn gọn hơn thì tắt được). Mặc định hiện đủ. */
  showSocial?: boolean;
  /** Tự focus ô đầu tiên — modal bật, trang portal để trình duyệt quyết. */
  autoFocus?: boolean;
}

/**
 * TOÀN BỘ logic form auth của XePrime nằm ở đây: email/SĐT + mật khẩu, OTP, Google, Facebook,
 * đăng ký, và bước gợi ý đặt mật khẩu sau khi đăng nhập OTP.
 *
 * Component này KHÔNG biết mình đang nằm trong modal của khách hay trang đăng nhập cổng quản
 * lý, và cũng không tự điều hướng — nó chỉ gọi `onAuthenticated`. Đó là điều giữ cho hai
 * presentation không trôi thành hai bộ logic đăng nhập khác nhau.
 */
export function AuthPanel({
  mode,
  onModeChange,
  onAuthenticated,
  showSocial = true,
  autoFocus = false,
}: AuthPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Đăng nhập OTP mà tài khoản chưa có mật khẩu → gợi ý đặt (có "Bỏ qua").
  const [passwordPrompt, setPasswordPrompt] = useState<CurrentUser | null>(null);

  const busy = pending !== null;

  async function finish(user: CurrentUser, justRegistered: boolean) {
    await onAuthenticated(user, { justRegistered });
    setPending(null);
  }

  async function run(key: string, action: () => Promise<CurrentUser>, justRegistered = false) {
    // Chống double-submit: mọi nút đều disabled khi `busy`, và nhánh này chặn cả trường hợp
    // Enter được nhấn liên tiếp trước khi React kịp render trạng thái disabled.
    if (busy) return;
    setPending(key);
    setError(null);
    try {
      const user = await action();
      await finish(user, justRegistered);
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(null);
    }
  }

  if (passwordPrompt) {
    return (
      <div className={styles.panel}>
        <SetPasswordPrompt
          primaryActionClassName={styles.submit}
          onDone={() => void finish(passwordPrompt, false)}
        />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {error ? <Alert type="error" showIcon message={error} className={styles.alert} /> : null}

      {mode === AUTH_MODE.REGISTER ? (
        <RegisterForm
          busy={busy}
          pending={pending === 'register'}
          autoFocus={autoFocus}
          onSubmit={(values) => run('register', () => registerWithPassword(values), true)}
        />
      ) : (
        <Tabs
          defaultActiveKey="password"
          centered
          className={styles.tabs}
          items={[
            {
              key: 'password',
              label: (
                <span className={styles.tabLabel}>
                  <MailOutlined /> Email / SĐT
                </span>
              ),
              children: (
                <PasswordForm
                  busy={busy}
                  pending={pending === 'password'}
                  autoFocus={autoFocus}
                  onSubmit={(values) =>
                    run('password', () => loginWithPassword(values.identifier, values.password))
                  }
                />
              ),
            },
            {
              key: 'otp',
              label: (
                <span className={styles.tabLabel}>
                  <MobileOutlined /> Đăng nhập OTP
                </span>
              ),
              children: (
                <PhoneLoginForm
                  onSuccess={(user) => {
                    if (user.hasPassword === false) setPasswordPrompt(user);
                    else void finish(user, false);
                  }}
                />
              ),
            },
          ]}
        />
      )}

      {showSocial ? (
        <>
          <Divider className={styles.divider} plain>
            hoặc
          </Divider>
          <div className={styles.oauth}>
            {[AUTH_PROVIDER.GOOGLE, AUTH_PROVIDER.FACEBOOK].map((provider) => (
              <Button
                key={provider}
                className={styles.oauthBtn}
                icon={<SocialProviderLogo provider={provider} className={styles.providerLogo} />}
                block
                size="large"
                loading={pending === provider}
                disabled={busy && pending !== provider}
                onClick={() => void signIn(provider)}
              >
                Tiếp tục với {AUTH_PROVIDER_LABEL[provider]}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      {onModeChange ? (
        <div className={styles.switch}>
          {mode === AUTH_MODE.LOGIN ? (
            <>
              Chưa có tài khoản?{' '}
              <button
                type="button"
                className={styles.linkBtn}
                disabled={busy}
                onClick={() => onModeChange(AUTH_MODE.REGISTER)}
              >
                Tạo tài khoản
              </button>
            </>
          ) : (
            <>
              Đã có tài khoản?{' '}
              <button
                type="button"
                className={styles.linkBtn}
                disabled={busy}
                onClick={() => onModeChange(AUTH_MODE.LOGIN)}
              >
                Đăng nhập
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  async function signIn(provider: AuthProvider) {
    await run(provider, async () => {
      const idToken = await getProviderIdToken(provider);
      return createSession(idToken);
    });
  }
}

function PasswordForm({
  busy,
  pending,
  autoFocus,
  onSubmit,
}: {
  busy: boolean;
  pending: boolean;
  autoFocus: boolean;
  onSubmit: (values: LoginValues) => void;
}) {
  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: yupResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextField
        control={control}
        name="identifier"
        label="Email hoặc số điện thoại"
        placeholder="Nhập email hoặc số điện thoại"
        autoComplete="username"
        prefix={<MailOutlined />}
        autoFocus={autoFocus}
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
      <div className={styles.rowEnd}>
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
        loading={pending}
        disabled={busy && !pending}
      >
        Đăng nhập
      </Button>
    </form>
  );
}

function RegisterForm({
  busy,
  pending,
  autoFocus,
  onSubmit,
}: {
  busy: boolean;
  pending: boolean;
  autoFocus: boolean;
  onSubmit: (values: { displayName: string; phone: string; password: string }) => void;
}) {
  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: yupResolver(registerSchema),
    defaultValues: { displayName: '', phone: '', password: '', confirmPassword: '' },
  });

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          displayName: values.displayName,
          phone: values.phone,
          password: values.password,
        }),
      )}
      noValidate
    >
      <TextField
        control={control}
        name="displayName"
        label="Họ tên"
        placeholder="Nhập họ và tên"
        autoComplete="name"
        prefix={<UserOutlined />}
        autoFocus={autoFocus}
      />
      <TextField
        control={control}
        name="phone"
        label="Số điện thoại"
        type="tel"
        placeholder="Nhập số điện thoại"
        autoComplete="tel"
        prefix={<PhoneOutlined />}
      />
      <TextField
        control={control}
        name="password"
        label="Mật khẩu"
        type="password"
        placeholder="Tối thiểu 8 ký tự, có chữ và số"
        autoComplete="new-password"
        prefix={<LockOutlined />}
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
        disabled={busy && !pending}
      >
        Tạo tài khoản
      </Button>
    </form>
  );
}
