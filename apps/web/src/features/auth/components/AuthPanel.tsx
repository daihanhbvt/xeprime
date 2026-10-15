'use client';

import { LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button, Divider } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { compactPhoneInput, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import {
  buildLoginSchema,
  buildPhoneLoginSchema,
  buildRegisterSchema,
  type LoginValues,
  type PhoneLoginValues,
  type RegisterValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { zoneAuthRoutes } from '@/constants/routes';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { OtpCodeStep } from '@/features/phone-verification/components/OtpCodeStep';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  loginWithPassword,
  checkRegistration,
  registerWithPassword,
  type AuthProvider,
  type CurrentUser,
} from '@/services/auth.service';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import { AUTH_MODE, type AuthMode } from '../post-auth-destination';
import { startSocialLogin } from '../lib/social-auth-url';
import { SocialProviderLogo } from './SocialProviderLogo';
import styles from './AuthPanel.module.css';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { resolveAppLocale } from '@/i18n/config';
import { useErrorCodeMessage, useErrorMessage } from '@/i18n/use-error-message';
import { useZone } from '@/zones/ZoneProvider';

export interface AuthPanelProps {
  mode: AuthMode;
  /** Đổi giữa Đăng nhập / Đăng ký. Không truyền = ẩn phần chuyển đổi (portal chỉ đăng nhập). */
  onModeChange?: (mode: AuthMode) => void;
  /** Gọi khi phiên đã được cấp. `justRegistered` để chỗ gọi hiện success state riêng. */
  onAuthenticated: (user: CurrentUser, ctx: { justRegistered: boolean }) => void | Promise<void>;
  /** Ẩn khối đăng nhập Google/Facebook. Mặc định hiện. */
  showSocial?: boolean;
  /**
   * CHỈ định danh + mật khẩu, nhận cả EMAIL — không mạng xã hội, không đăng ký. Dành cho site
   * quản trị: tài khoản realm `platform` đăng nhập bằng email/SĐT + mật khẩu (ADR 0053 điều 3), và
   * API từ chối mạng xã hội cho realm đó — hiện nút ra là hứa một đường chắc chắn hỏng.
   */
  passwordOnly?: boolean;
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
 * TOÀN BỘ logic form auth của XePrime nằm ở đây — ADR 0060:
 *
 *  - **Đăng nhập** (site khách, site partner): SỐ ĐIỆN THOẠI + mật khẩu, "Quên mật khẩu",
 *    Google/Facebook. Không còn ô email, không còn đăng nhập bằng OTP. Site quản trị
 *    (`passwordOnly`) giữ ô "Email hoặc SĐT".
 *  - **Đăng ký**: SĐT · tên hiển thị · mật khẩu · nhập lại → gửi mã OTP tới SĐT → nhập mã → tài
 *    khoản ra đời với SĐT đã xác minh. Mã chỉ CHỨNG MINH SỐ, phiên đến từ chính lượt đăng ký.
 *
 * Realm của tài khoản do SITE quyết (proxy), không do form — cùng một panel ở site khách tạo tài
 * khoản khách, ở site partner tạo tài khoản đối tác (ADR 0053).
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
  passwordOnly = false,
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
  // Mã `?authError=` đã được chuyển thành thông báo rồi — để nó không quay lại sau mỗi lần
  // người dùng thao tác tiếp.
  const [consumedErrorCode, setConsumedErrorCode] = useState<string | null>(null);

  /** Máy gửi mã của bước đăng ký — mã `purpose=register`, không dùng chéo mục đích khác. */
  const registerOtp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.REGISTER);
  /**
   * Thông tin đăng ký ĐANG CHỜ MÃ. `null` ⇒ còn ở bước điền form. Chỉ sống trong bộ nhớ: mật khẩu
   * không bao giờ được ghi xuống storage hay URL.
   */
  const [registration, setRegistration] = useState<RegisterValues | null>(null);
  /** Lần điền gần nhất — điền lại form khi người dùng bấm "Sửa thông tin" ở bước mã. */
  const [registerDraft, setRegisterDraft] = useState<RegisterValues | null>(null);
  const [code, setCode] = useState('');

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

  async function run(key: string, action: () => Promise<CurrentUser>, justRegistered = false) {
    // Chống double-submit: mọi nút đều disabled khi `busy`, và nhánh này chặn cả trường hợp
    // Enter được nhấn liên tiếp (hay ô mã tự gửi) trước khi React kịp render trạng thái disabled.
    if (busy) return;
    setPending(key);
    setError(null);
    try {
      const user = await action();
      await onAuthenticated(user, { justRegistered });
      setPending(null);
    } catch (err) {
      setError(apiErrorMessage(err));
      setPending(null);
    }
  }

  /**
   * Bước 1 của đăng ký: gửi mã tới SĐT rồi sang bước nhập mã. Số đã có tài khoản ở site này ⇒
   * server từ chối ngay ở đây (`PHONE_TAKEN`), trước khi tốn một tin nhắn.
   *
   * Môi trường nhận mã test (dev/staging) KHÔNG tự gửi: sang thẳng bước mã, gõ mã test là qua —
   * hoặc bấm "Gửi mã" để nhận SMS thật.
   */
  async function startRegistration(values: RegisterValues) {
    if (busy) return;
    setError(null);
    setRegisterDraft(values);
    setPending('sendCode');
    try {
      /*
       * Kiểm HẾT ở bước này rồi mới sang bước mã: SĐT, mật khẩu, họ tên, và SĐT chưa có tài khoản
       * ở site này — kể cả ở môi trường nhận mã test (không gửi SMS nên bước gửi mã không kiểm hộ).
       */
      try {
        await checkRegistration({
          displayName: values.displayName,
          phone: values.phone.trim(),
          password: values.password,
        });
      } catch (err) {
        setError(apiErrorMessage(err));
        return;
      }
      if (!registerOtp.testCodeEnabled) await registerOtp.sendAsync(values.phone.trim());
      setCode('');
      setRegistration(values);
    } catch {
      // Lỗi gửi mã (cooldown…) hiện qua `registerOtp.error` ngay trên form.
    } finally {
      setPending(null);
    }
  }

  function confirmRegistration(submitted: string) {
    if (!registration) return;
    void run(
      'register',
      () =>
        registerWithPassword({
          displayName: registration.displayName,
          phone: registration.phone.trim(),
          password: registration.password,
          code: submitted,
        }),
      true,
    );
  }

  /** Quay lại form đăng ký — giữ nguyên thứ đã điền; mã đã gửi vẫn tính cooldown ở server. */
  function editRegistration() {
    setRegistration(null);
    setCode('');
    setError(null);
    registerOtp.reset();
  }

  function switchMode(next: AuthMode) {
    setRegistration(null);
    setCode('');
    setError(null);
    registerOtp.reset();
    onModeChange?.(next);
  }

  const inRegisterOtp = !passwordOnly && mode === AUTH_MODE.REGISTER && registration !== null;
  // Lỗi gửi mã chỉ thuộc về bước form — ở bước mã, `OtpCodeStep` tự hiện lỗi của nó.
  const formError =
    error ?? (mode === AUTH_MODE.REGISTER && !inRegisterOtp ? registerOtp.error : null);

  return (
    <div className={styles.panel}>
      {inRegisterOtp ? (
        <>
          <div className={styles.stepHead}>
            <div className={styles.stepTitle}>{t('register.verifyTitle')}</div>
            <div className={styles.stepSub}>{t('register.verifySub')}</div>
          </div>
          <OtpCodeStep
            phone={registration.phone.trim()}
            verify={registerOtp}
            code={code}
            onCodeChange={(next) => {
              if (error) setError(null);
              setCode(next);
            }}
            onSubmit={confirmRegistration}
            submitLabel={t('register.verifySubmit')}
            submitting={pending === 'register'}
            onEdit={editRegistration}
            editLabel={t('register.editInfo')}
            error={error}
          />
        </>
      ) : (
        <>
          {formError ? (
            <Alert type="error" showIcon title={formError} className={styles.alert} role="alert" />
          ) : null}

          {passwordOnly ? (
            <IdentifierPasswordForm
              busy={busy}
              pending={pending === 'password'}
              autoFocus={autoFocus}
              onSubmit={(values) =>
                run('password', () => loginWithPassword(values.identifier, values.password))
              }
            />
          ) : mode === AUTH_MODE.REGISTER ? (
            <RegisterForm
              busy={busy}
              pending={pending === 'sendCode'}
              autoFocus={autoFocus}
              defaultValues={registerDraft}
              onSubmit={(values) => void startRegistration(values)}
            />
          ) : (
            <PhonePasswordForm
              busy={busy}
              pending={pending === 'password'}
              autoFocus={autoFocus}
              onSubmit={(values) =>
                run('password', () =>
                  // Bỏ dấu cách/chấm/gạch người dùng chép từ danh bạ — server bỏ cùng một cách.
                  loginWithPassword(compactPhoneInput(values.phone), values.password),
                )
              }
            />
          )}

          {showSocial && !passwordOnly ? (
            <>
              <Divider className={styles.divider} plain>
                {t('social.divider')}
              </Divider>
              <div className={styles.oauth}>
                {[AUTH_PROVIDER.FACEBOOK, AUTH_PROVIDER.GOOGLE].map((provider) => (
                  <Button
                    key={provider}
                    className={styles.oauthBtn}
                    icon={
                      <SocialProviderLogo provider={provider} className={styles.providerLogo} />
                    }
                    block
                    size="large"
                    loading={pending === provider}
                    disabled={busy && pending !== provider}
                    onClick={() => signIn(provider)}
                  >
                    {t(mode === AUTH_MODE.REGISTER ? 'social.registerWith' : 'social.loginWith', {
                      provider: AUTH_PROVIDER_LABEL[provider],
                    })}
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
                    onClick={() => switchMode(AUTH_MODE.REGISTER)}
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
                    onClick={() => switchMode(AUTH_MODE.LOGIN)}
                  >
                    {t('switchMode.toLogin')}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  /**
   * Đăng nhập/đăng ký mạng xã hội = RỜI TRANG (ADR 0019), không phải một lời gọi API.
   *
   * Vì thế nó không đi qua `run()`: không có promise nào để `await`, không có lỗi nào để bắt, và
   * `onAuthenticated` sẽ không bao giờ chạy — khi quay lại, đây là một lần tải trang mới đã có
   * cookie phiên của ĐÚNG site đang mở (realm ghi trong `oauth_states`). Tài khoản mới tạo bằng
   * Google/Facebook chưa có SĐT ⇒ bước "Hoàn thiện hồ sơ" (`AccountPhoneGate`) hiện ngay sau đó.
   * Trạng thái `pending` vẫn đặt để nút khoá lại trong lúc trình duyệt điều hướng.
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

/** "Quên mật khẩu?" của site đang mở — mỗi site một không gian tài khoản (ADR 0053). */
function ForgotLink() {
  const t = useTranslations('Auth');
  const forgotHref = zoneAuthRoutes(useZone()).forgotPassword;
  return (
    <div className={styles.rowEnd}>
      <Link href={forgotHref} className={styles.link}>
        {t('login.forgot')}
      </Link>
    </div>
  );
}

function SubmitButton({
  busy,
  pending,
  label,
}: {
  busy: boolean;
  pending: boolean;
  label: string;
}) {
  return (
    <Button
      type="primary"
      htmlType="submit"
      block
      size="large"
      className={styles.submit}
      loading={pending}
      disabled={busy && !pending}
    >
      {label}
    </Button>
  );
}

/** Site khách / site partner: SỐ ĐIỆN THOẠI + mật khẩu (ADR 0060). */
function PhonePasswordForm({
  busy,
  pending,
  autoFocus,
  onSubmit,
}: {
  busy: boolean;
  pending: boolean;
  autoFocus: boolean;
  onSubmit: (values: PhoneLoginValues) => void;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  // Schema phải dựng lại khi đổi ngôn ngữ — câu lỗi nằm TRONG schema, không phải trong component.
  const schema = useMemo(() => buildPhoneLoginSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<PhoneLoginValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: '', password: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextField
        control={control}
        name="phone"
        label={t('login.phone')}
        type="tel"
        placeholder={t('login.phonePlaceholder')}
        // `username`: trình quản lý mật khẩu ghép đúng cặp SĐT + mật khẩu đã lưu.
        autoComplete="username"
        prefix={<PhoneOutlined />}
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
      <ForgotLink />
      <SubmitButton busy={busy} pending={pending} label={t('login.submit')} />
    </form>
  );
}

/** Site quản trị: email HOẶC SĐT + mật khẩu (realm `platform` không đổi — ADR 0053 điều 3). */
function IdentifierPasswordForm({
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
      <ForgotLink />
      <SubmitButton busy={busy} pending={pending} label={t('login.submit')} />
    </form>
  );
}

function RegisterForm({
  busy,
  pending,
  autoFocus,
  defaultValues,
  onSubmit,
}: {
  busy: boolean;
  pending: boolean;
  autoFocus: boolean;
  /** Thông tin đã điền lần trước — khi quay lại từ bước nhập mã. */
  defaultValues: RegisterValues | null;
  onSubmit: (values: RegisterValues) => void;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildRegisterSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: yupResolver(schema),
    defaultValues: defaultValues ?? {
      displayName: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextField
        control={control}
        name="phone"
        label={t('register.phone')}
        type="tel"
        placeholder={t('register.phonePlaceholder')}
        autoComplete="tel"
        prefix={<PhoneOutlined />}
        help={t('register.phoneHint')}
        autoFocus={autoFocus}
      />
      <TextField
        control={control}
        name="displayName"
        label={t('register.displayName')}
        placeholder={t('register.fullNamePlaceholder')}
        autoComplete="name"
        prefix={<UserOutlined />}
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
      <SubmitButton busy={busy} pending={pending} label={t('register.submit')} />
    </form>
  );
}
