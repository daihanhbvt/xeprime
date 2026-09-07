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
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  buildLoginSchema,
  buildRegisterSchema,
  type LoginValues,
  type RegisterValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { PhoneLoginForm } from '@/features/phone-verification/components/PhoneLoginForm';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  loginWithPassword,
  registerWithPassword,
  type AuthProvider,
  type CurrentUser,
} from '@/services/auth.service';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import { AUTH_MODE, type AuthMode } from '../post-auth-destination';
import { startSocialLogin } from '../lib/social-auth-url';
import { SetPasswordPrompt } from './SetPasswordPrompt';
import { SocialProviderLogo } from './SocialProviderLogo';
import styles from './AuthPanel.module.css';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { resolveAppLocale } from '@/i18n/config';
import { useErrorCodeMessage, useErrorMessage } from '@/i18n/use-error-message';

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
  /**
   * Mã lỗi (`API_ERROR_CODE`) mang về từ `?authError=` sau một lần đăng nhập mạng xã hội hỏng.
   *
   * Đăng nhập social là một lần RỜI TRANG (ADR 0019), nên lỗi của nó không thể là state của
   * component như lỗi của form — nó phải sống sót qua một vòng điều hướng, và URL là chỗ duy
   * nhất làm được điều đó.
   */
  initialErrorCode?: string | null;
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
  initialErrorCode = null,
}: AuthPanelProps) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const pathname = usePathname();
  const apiErrorMessage = useErrorMessage();
  const errorCodeMessage = useErrorCodeMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Đăng nhập OTP mà tài khoản chưa có mật khẩu → gợi ý đặt (có "Bỏ qua").
  const [passwordPrompt, setPasswordPrompt] = useState<CurrentUser | null>(null);
  // Mã `?authError=` đã được chuyển thành thông báo rồi — để nó không quay lại sau mỗi lần
  // người dùng thao tác tiếp.
  const [consumedErrorCode, setConsumedErrorCode] = useState<string | null>(null);

  const busy = pending !== null;

  /*
   * Nạp mã lỗi từ URL NGAY TRONG RENDER, không qua `useEffect`.
   *
   * Không dùng initializer của `useState`: mã đến từ `?authError=`, mà `AuthUrlSync` đọc URL
   * trong một effect — nên ở modal, `AuthPanel` mount TRƯỚC khi mã tới, và initializer (chạy đúng
   * một lần) sẽ đọc `null` rồi thông báo lỗi biến mất.
   *
   * Không dùng `useEffect` vì đây không phải đồng bộ với hệ thống bên ngoài — đó là mẫu "điều
   * chỉnh state khi prop đổi" mà React khuyến nghị: setState trong render làm React render lại
   * ngay, không commit lần dở dang, nên không có nháy màn hình và không có render dây chuyền.
   */
  if (initialErrorCode && initialErrorCode !== consumedErrorCode) {
    setConsumedErrorCode(initialErrorCode);
    setError(errorCodeMessage(initialErrorCode));
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
      setError(apiErrorMessage(err));
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
                onClick={() => signIn(provider)}
              >
                {t('social.continueWith', { provider: AUTH_PROVIDER_LABEL[provider] })}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      {/*
        Cam kết pháp lý đứng NGAY dưới bộ nút đăng nhập/đăng ký, đúng chỗ và đúng lúc: modal
        đăng nhập và `/manage/login` đều không có chân trang marketplace, nên nếu không có
        dòng này thì cả hai đường vào tài khoản không hề dẫn tới điều khoản nào.
      */}
      <LegalConsentNote place="auth" className={styles.consent} />

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

  /**
   * Đăng nhập mạng xã hội = RỜI TRANG (ADR 0019), không phải một lời gọi API.
   *
   * Vì thế nó không đi qua `run()`: không có promise nào để `await`, không có lỗi nào để bắt, và
   * `finish()` sẽ không bao giờ chạy — khi quay lại, đây là một lần tải trang mới đã có cookie
   * phiên. Trạng thái `pending` vẫn đặt để nút khoá lại trong lúc trình duyệt điều hướng.
   */
  function signIn(provider: AuthProvider) {
    if (busy) return;
    setPending(provider);
    setError(null);
    startSocialLogin(provider, {
      pathname,
      search: window.location.search,
      locale: resolveAppLocale(locale),
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
  const labels = useAuthSchemaLabels();
  // Schema phải dựng lại khi đổi ngôn ngữ — câu lỗi nằm TRONG schema, không phải trong component.
  const schema = useMemo(() => buildLoginSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: yupResolver(schema),
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
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildRegisterSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: yupResolver(schema),
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
