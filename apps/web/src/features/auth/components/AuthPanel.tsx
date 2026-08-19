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
import { useLocale, useTranslations } from 'next-intl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { SocialAuthError } from '../lib/firebase-social-auth';

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
/** Khoá hợp lệ của `Auth.*` — xem `i18n/keys.ts` về việc không dùng generic. */
type AuthKey = Parameters<ReturnType<typeof useTranslations<'Auth'>>>[0];

export function AuthPanel({
  mode,
  onModeChange,
  onAuthenticated,
  showSocial = true,
  autoFocus = false,
}: AuthPanelProps) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const apiErrorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Đăng nhập OTP mà tài khoản chưa có mật khẩu → gợi ý đặt (có "Bỏ qua").
  const [passwordPrompt, setPasswordPrompt] = useState<CurrentUser | null>(null);

  const busy = pending !== null;

  /**
   * Lỗi ở màn đăng nhập đến từ HAI nguồn: API của XePrime (mã trong `API_ERROR_CODE`) và
   * popup của Firebase (mã `auth/...`, đã quy về `SocialAuthError`). Cả hai đều nói bằng MÃ,
   * nên chỗ này chỉ việc chọn đúng bảng chữ.
   */
  function describeError(err: unknown): string {
    if (err instanceof SocialAuthError) {
      return t(`socialError.${err.key}` as AuthKey, {
        provider: err.provider ? AUTH_PROVIDER_LABEL[err.provider] : '',
      });
    }
    return apiErrorMessage(err);
  }

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
      setError(describeError(err));
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
                  <MailOutlined /> {t('tabs.password')}
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
                  <MobileOutlined /> {t('tabs.otp')}
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
            {t('social.divider')}
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
                {t('social.continueWith', { provider: AUTH_PROVIDER_LABEL[provider] })}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      {onModeChange ? (
        <div className={styles.switch}>
          {mode === AUTH_MODE.LOGIN ? (
            <>
              {t('switchMode.noAccount')}{' '}
              <button
                type="button"
                className={styles.linkBtn}
                disabled={busy}
                onClick={() => onModeChange(AUTH_MODE.REGISTER)}
              >
                {t('switchMode.toRegister')}
              </button>
            </>
          ) : (
            <>
              {t('switchMode.hasAccount')}{' '}
              <button
                type="button"
                className={styles.linkBtn}
                disabled={busy}
                onClick={() => onModeChange(AUTH_MODE.LOGIN)}
              >
                {t('switchMode.toLogin')}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  async function signIn(provider: AuthProvider) {
    await run(provider, async () => {
      const idToken = await getProviderIdToken(provider, locale);
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
  const t = useTranslations('Auth');
  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: yupResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextField
        control={control}
        name="identifier"
        label={t('login.identifier')}
        placeholder={t('login.identifierPlaceholder')}
        autoComplete="username"
        prefix={<MailOutlined />}
        autoFocus={autoFocus}
      />
      <TextField
        control={control}
        name="password"
        label={t('login.password')}
        type="password"
        placeholder={t('login.passwordPlaceholder')}
        autoComplete="current-password"
        prefix={<LockOutlined />}
      />
      <div className={styles.rowEnd}>
        <Link href={ROUTES.FORGOT_PASSWORD} className={styles.link}>
          {t('login.forgot')}
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
        {t('login.submit')}
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
  const t = useTranslations('Auth');
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
        label={t('register.fullName')}
        placeholder={t('register.fullNamePlaceholder')}
        autoComplete="name"
        prefix={<UserOutlined />}
        autoFocus={autoFocus}
      />
      <TextField
        control={control}
        name="phone"
        label={t('register.phone')}
        type="tel"
        placeholder={t('register.phonePlaceholder')}
        autoComplete="tel"
        prefix={<PhoneOutlined />}
      />
      <TextField
        control={control}
        name="password"
        label={t('register.password')}
        type="password"
        placeholder={t('register.passwordPlaceholder')}
        autoComplete="new-password"
        prefix={<LockOutlined />}
      />
      <TextField
        control={control}
        name="confirmPassword"
        label={t('register.confirmPassword')}
        type="password"
        placeholder={t('register.confirmPasswordPlaceholder')}
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
        {t('register.submit')}
      </Button>
    </form>
  );
}
