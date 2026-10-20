'use client';

import { LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button, Divider } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
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
import { AUTH_PROVIDER, AUTH_PROVIDER_LABEL, type CurrentUser } from '@/services/auth.service';
import { useZone } from '@/zones/ZoneProvider';
import { useAuthFlow } from '../hooks/use-auth-flow';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import { AUTH_MODE, type PanelAuthMode } from '../post-auth-destination';
import { SocialProviderLogo } from './SocialProviderLogo';
import styles from './AuthPanel.module.css';

export interface AuthPanelProps {
  mode: PanelAuthMode;
  /** Đổi giữa Đăng nhập / Đăng ký. Không truyền = ẩn phần chuyển đổi (portal chỉ đăng nhập). */
  onModeChange?: (mode: PanelAuthMode) => void;
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
  /** Tự focus ô đầu tiên — trang portal để trình duyệt quyết. */
  autoFocus?: boolean;
  /** Mã lỗi (`API_ERROR_CODE`) mang về từ `?authError=` — xem `useAuthFlow`. */
  initialErrorCode?: string | null;
}

/**
 * Form đăng nhập/đăng ký của site PARTNER và site QUẢN TRỊ — phần NHÌN. Logic (gửi mã, tạo tài
 * khoản, cấp phiên, mạng xã hội) nằm ở `useAuthFlow`, dùng chung với hộp tài khoản của site khách
 * (`MarketAuthForms`, design v2) — ADR 0060:
 *
 *  - **Đăng nhập**: SỐ ĐIỆN THOẠI + mật khẩu, "Quên mật khẩu", Google/Facebook. Site quản trị
 *    (`passwordOnly`) giữ ô "Email hoặc SĐT".
 *  - **Đăng ký**: SĐT · tên hiển thị · mật khẩu · nhập lại → gửi mã OTP tới SĐT → nhập mã → tài
 *    khoản ra đời với SĐT đã xác minh.
 *
 * Component này KHÔNG biết mình nằm trên trang đăng nhập cổng quản lý hay trang đăng ký đối tác,
 * và cũng không tự điều hướng — nó chỉ gọi `onAuthenticated`.
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
  const flow = useAuthFlow({ onAuthenticated, initialErrorCode });
  const { error, pending, busy, registerOtp, registration } = flow;

  function switchMode(next: PanelAuthMode) {
    flow.editRegistration();
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
            code={flow.code}
            onCodeChange={flow.changeCode}
            onSubmit={(submitted) => void flow.confirmRegistration(submitted)}
            submitLabel={t('register.verifySubmit')}
            submitting={pending === 'register'}
            onEdit={flow.editRegistration}
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
              onSubmit={(values) => void flow.loginWithIdentifier(values)}
            />
          ) : mode === AUTH_MODE.REGISTER ? (
            <RegisterForm
              busy={busy}
              pending={pending === 'sendCode'}
              autoFocus={autoFocus}
              defaultValues={flow.registerDraft}
              onSubmit={(values) => void flow.startRegistration(values)}
            />
          ) : (
            <PhonePasswordForm
              busy={busy}
              pending={pending === 'password'}
              autoFocus={autoFocus}
              onSubmit={(values) => void flow.loginWithPhone(values)}
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
                    onClick={() => flow.signIn(provider)}
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
            Cam kết pháp lý đứng NGAY dưới bộ nút đăng nhập/đăng ký, đúng chỗ và đúng lúc: trang
            đăng nhập cổng quản lý không có chân trang marketplace, nên nếu không có dòng này thì
            đường vào tài khoản không hề dẫn tới điều khoản nào.
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
