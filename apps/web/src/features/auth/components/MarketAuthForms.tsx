'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Checkbox } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { compactPhoneInput } from '@xeprime/types';
import {
  buildPhoneLoginSchema,
  buildRegisterSchema,
  type PhoneLoginValues,
  type RegisterValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { cx } from '@/lib/cx';
import { AUTH_PROVIDER, AUTH_PROVIDER_LABEL, type CurrentUser } from '@/services/auth.service';
import { useAuthFlow, type AuthFlow } from '../hooks/use-auth-flow';
import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import { readRememberedPhone, rememberPhone } from '../lib/remembered-phone';
import { AUTH_MODE, type PanelAuthMode } from '../post-auth-destination';
import { LockIcon, passwordVisibilityIcon, TextIcon, UserIcon } from './AuthIcons';
import { SocialProviderLogo } from './SocialProviderLogo';
import { VerifyAccountDialog } from './VerifyAccountDialog';
import styles from './MarketAuth.module.css';

/** Thứ tự nút mạng xã hội của bản vẽ: Google trái, Facebook phải. */
const SOCIAL_PROVIDERS = [AUTH_PROVIDER.GOOGLE, AUTH_PROVIDER.FACEBOOK] as const;

export interface MarketAuthFormsProps {
  mode: PanelAuthMode;
  onModeChange: (mode: PanelAuthMode) => void;
  /** "Quên mật khẩu?" — mang theo SĐT đang gõ sang bước quên mật khẩu. */
  onForgot: (phone: string) => void;
  /** Phiên đã được cấp (đăng nhập, hoặc đăng ký + xác minh OTP xong). */
  onAuthenticated: (user: CurrentUser, ctx: { justRegistered: boolean }) => void | Promise<void>;
  /** Mã lỗi từ `?authError=` (đăng nhập mạng xã hội hỏng) — xem `useAuthFlow`. */
  initialErrorCode?: string | null;
  /** Hộp mở giữa luồng thuê xe — phụ đề nói vì sao được hỏi đăng nhập. */
  forBooking: boolean;
  /** SĐT điền sẵn ở form đăng nhập (vừa đặt lại mật khẩu xong). */
  prefillPhone?: string | null;
  /** Tự focus ô đầu tiên — desktop có, mobile để bàn phím không bật lên che form. */
  autoFocus: boolean;
}

/**
 * Cột form của hộp tài khoản site khách — ĐĂNG NHẬP và ĐĂNG KÝ theo design v2 (Figma `19786:74740`,
 * `19786:77643`). Logic là `useAuthFlow` (dùng chung với `AuthPanel` của site partner); ở đây chỉ
 * có phần nhìn và hai thứ riêng của site khách:
 *
 *  - "Ghi nhớ tài khoản": nhớ SĐT đã đăng nhập thành công để lần sau điền sẵn (`remembered-phone`).
 *  - Đăng ký → popup "Xác minh tài khoản" → mã đúng là tài khoản ra đời VÀ đã đăng nhập — hộp đóng
 *    thẳng, khách ở lại đúng chỗ đang xem (hoặc đi tiếp hành động đã bị chặn).
 */
export function MarketAuthForms({
  mode,
  onModeChange,
  onForgot,
  onAuthenticated,
  initialErrorCode = null,
  forBooking,
  prefillPhone = null,
  autoFocus,
}: MarketAuthFormsProps) {
  const t = useTranslations('Auth');
  /**
   * Phiên đã cấp: popup xác minh đóng NGAY, không đợi hộp ngoài chạy xong hiệu ứng đóng — nếu không
   * popup còn treo trên màn hình thêm một nhịp sau khi khách đã vào được tài khoản.
   */
  const [finished, setFinished] = useState(false);
  const flow = useAuthFlow({
    initialErrorCode,
    onAuthenticated: async (user, ctx) => {
      setFinished(true);
      await onAuthenticated(user, ctx);
    },
  });
  const { error, pending, busy, registerOtp, registration } = flow;
  const isRegister = mode === AUTH_MODE.REGISTER;
  const inVerify = isRegister && registration !== null;

  // Lỗi của bước mã hiện trong popup; lỗi gửi mã (cooldown…) thuộc về form.
  const formError = inVerify ? null : (error ?? (isRegister ? registerOtp.error : null));

  function switchMode(next: PanelAuthMode) {
    flow.editRegistration();
    onModeChange(next);
  }

  return (
    <div className={cx(styles.panel, isRegister && styles.panelCompact)}>
      <header className={styles.header}>
        <h2 className={cx(styles.title, styles.caps)}>
          {isRegister ? t('market.register.title') : t('market.login.title')}
        </h2>
        <p className={styles.sub}>
          {forBooking
            ? t('modal.bookingSub')
            : t.rich(isRegister ? 'market.register.sub' : 'market.login.sub', {
                br: () => <br />,
              })}
        </p>
      </header>

      {formError ? (
        <Alert type="error" showIcon title={formError} className={styles.alert} role="alert" />
      ) : null}

      {isRegister ? (
        <RegisterForm
          flow={flow}
          autoFocus={autoFocus}
          switchLine={
            <SwitchLine
              question={t('market.register.hasAccount')}
              action={t('market.register.toLogin')}
              disabled={busy}
              onClick={() => switchMode(AUTH_MODE.LOGIN)}
            />
          }
        />
      ) : (
        <LoginForm
          flow={flow}
          autoFocus={autoFocus}
          prefillPhone={prefillPhone}
          onForgot={onForgot}
          switchLine={
            <SwitchLine
              question={t('market.login.noAccount')}
              action={t('market.login.toRegister')}
              disabled={busy}
              onClick={() => switchMode(AUTH_MODE.REGISTER)}
            />
          }
        />
      )}

      <p className={styles.divider}>{t('market.divider')}</p>

      <div className={styles.social}>
        <div className={styles.socialRow}>
          {SOCIAL_PROVIDERS.map((provider) => (
            <CtaButton
              key={provider}
              variant="neutral"
              size="form"
              block
              iconStart={<SocialProviderLogo provider={provider} className={styles.socialLogo} />}
              loading={pending === provider}
              disabled={busy && pending !== provider}
              onClick={() => flow.signIn(provider)}
              ariaLabel={t('market.socialAria', { provider: AUTH_PROVIDER_LABEL[provider] })}
            >
              {AUTH_PROVIDER_LABEL[provider]}
            </CtaButton>
          ))}
        </div>
        <LegalConsentNote place="marketAuth" className={styles.consent} />
      </div>

      {registration ? (
        <VerifyAccountDialog
          open={inVerify && !finished}
          phone={registration.phone.trim()}
          verify={registerOtp}
          code={flow.code}
          onCodeChange={flow.changeCode}
          onSubmit={(submitted) => void flow.confirmRegistration(submitted)}
          submitting={pending === 'register'}
          error={error}
          onClose={flow.editRegistration}
        />
      ) : null}
    </div>
  );
}

function SwitchLine({
  question,
  action,
  disabled,
  onClick,
}: {
  question: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <p className={styles.switchLine}>
      {question}
      <button type="button" className={styles.textLink} disabled={disabled} onClick={onClick}>
        {action}
      </button>
    </p>
  );
}

/** Đăng nhập: SỐ ĐIỆN THOẠI + mật khẩu (ADR 0060 — nhãn ô là SĐT, server từ chối email). */
function LoginForm({
  flow,
  autoFocus,
  prefillPhone,
  onForgot,
  switchLine,
}: {
  flow: AuthFlow;
  autoFocus: boolean;
  prefillPhone: string | null;
  onForgot: (phone: string) => void;
  switchLine: ReactNode;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  // Schema phải dựng lại khi đổi ngôn ngữ — câu lỗi nằm TRONG schema, không phải trong component.
  const schema = useMemo(() => buildPhoneLoginSchema(labels), [labels]);
  // Đọc một lần lúc dựng form: hộp chỉ dựng nội dung ở client, sau khi mở.
  const [remembered] = useState(readRememberedPhone);
  const [remember, setRemember] = useState(remembered !== null);
  const { control, handleSubmit, getValues } = useForm<PhoneLoginValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: prefillPhone ?? remembered ?? '', password: '' },
  });

  async function submit(values: PhoneLoginValues) {
    const ok = await flow.loginWithPhone(values);
    if (ok) rememberPhone(remember ? compactPhoneInput(values.phone) : null);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(submit)} noValidate>
      <div className={styles.fields}>
        <TextField
          control={control}
          name="phone"
          label={t('login.phone')}
          type="tel"
          placeholder={t('login.phonePlaceholder')}
          // `username`: trình quản lý mật khẩu ghép đúng cặp SĐT + mật khẩu đã lưu.
          autoComplete="username"
          prefix={<UserIcon className={styles.fieldIcon} />}
          autoFocus={autoFocus}
        />
        <TextField
          control={control}
          name="password"
          label={t('login.password')}
          type="password"
          placeholder={t('login.passwordPlaceholder')}
          autoComplete="current-password"
          prefix={<LockIcon className={styles.fieldIcon} />}
          visibilityIcon={passwordVisibilityIcon}
        />
        <div className={styles.formAction}>
          <Checkbox
            className={styles.remember}
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          >
            {t('market.login.remember')}
          </Checkbox>
          <button
            type="button"
            className={cx(styles.textLink, styles.smallLink)}
            disabled={flow.busy}
            onClick={() => onForgot(getValues('phone'))}
          >
            {t('login.forgot')}
          </button>
        </div>
      </div>
      <div className={styles.submitBlock}>
        <CtaButton
          type="submit"
          size="form"
          block
          loading={flow.pending === 'password'}
          disabled={flow.busy && flow.pending !== 'password'}
        >
          {t('login.submit')}
        </CtaButton>
        {switchLine}
      </div>
    </form>
  );
}

/** Đăng ký: SĐT · tên hiển thị · mật khẩu · xác nhận → popup mã OTP. */
function RegisterForm({
  flow,
  autoFocus,
  switchLine,
}: {
  flow: AuthFlow;
  autoFocus: boolean;
  switchLine: ReactNode;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildRegisterSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: yupResolver(schema),
    // Quay lại từ popup mã (hoặc từ tab đăng nhập) thì thứ đã điền còn nguyên.
    defaultValues: flow.registerDraft ?? {
      displayName: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit((values) => flow.startRegistration(values))}
      noValidate
    >
      <div className={styles.fields}>
        <TextField
          control={control}
          name="phone"
          label={t('register.phone')}
          type="tel"
          placeholder={t('register.phonePlaceholder')}
          autoComplete="tel"
          prefix={<UserIcon className={styles.fieldIcon} />}
          autoFocus={autoFocus}
        />
        <TextField
          control={control}
          name="displayName"
          label={t('register.displayName')}
          placeholder={t('market.register.displayNamePlaceholder')}
          autoComplete="name"
          prefix={<TextIcon className={styles.fieldIcon} />}
        />
        <TextField
          control={control}
          name="password"
          label={t('register.password')}
          type="password"
          placeholder={t('market.register.passwordPlaceholder')}
          autoComplete="new-password"
          prefix={<LockIcon className={styles.fieldIcon} />}
          visibilityIcon={passwordVisibilityIcon}
        />
        <TextField
          control={control}
          name="confirmPassword"
          label={t('market.register.confirmPassword')}
          type="password"
          placeholder={t('register.confirmPasswordPlaceholder')}
          autoComplete="new-password"
          prefix={<LockIcon className={styles.fieldIcon} />}
          visibilityIcon={passwordVisibilityIcon}
        />
      </div>
      <div className={styles.submitBlock}>
        <CtaButton
          type="submit"
          size="form"
          block
          loading={flow.pending === 'sendCode'}
          disabled={flow.busy && flow.pending !== 'sendCode'}
        >
          {t('market.register.submit')}
        </CtaButton>
        {switchLine}
      </div>
    </form>
  );
}
