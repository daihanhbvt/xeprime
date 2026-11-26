import { yupResolver } from '@hookform/resolvers/yup';
import { Image, type ImageProps } from 'expo-image';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, type TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  MOBILE_CLIENT_APP,
  OTP_POLICY,
  PHONE_VERIFICATION_PURPOSE,
  compactPhoneInput,
} from '@xeprime/types';
import {
  buildLoginPhoneSchema,
  buildResetPasswordSchema,
  type ResetPasswordValues,
} from '@xeprime/validators';
import { APP_PROFILE } from '@/app-profile';
import { images } from '@/assets';
import { Screen } from '@/components/layout/Screen';
import { BackArrow } from '@/components/ui/BackArrow';
import { Button } from '@/components/ui/Button';
import { FieldAppearanceProvider } from '@/components/ui/Field';
import { SuccessSheet } from '@/components/ui/SuccessSheet';
import { TextField } from '@/components/ui/TextField';
import { resetPasswordWithOtp } from '@/features/auth/api';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { formatOtpCooldown } from '@/features/phone-verification/format-cooldown';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhoneStars } from '@/features/phone-verification/mask';
import { useErrorCodeMessage, useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { AuthSwitchLink } from './components/AuthSwitchLink';
import { useAuthSchemaLabels } from './use-auth-schema-labels';

/** Ba bước của bản vẽ — cũng là ba vạch của thanh tiến trình (web `FORGOT_STEP`). */
const FORGOT_STEP = { PHONE: 1, CODE: 2, PASSWORD: 3 } as const;
type ForgotStep = (typeof FORGOT_STEP)[keyof typeof FORGOT_STEP];
const STEPS: readonly ForgotStep[] = [FORGOT_STEP.PHONE, FORGOT_STEP.CODE, FORGOT_STEP.PASSWORD];

/**
 * Lỗi nói rằng MÃ không còn mở được việc đổi mật khẩu (sai, hết hạn, bị khoá). Gặp ở bước đặt mật
 * khẩu ⇒ về bước nhập mã, không để khách gõ lại mật khẩu vào một mã đã chết (web `DEAD_CODE_ERRORS`).
 */
const DEAD_CODE_ERRORS = new Set<string>([
  API_ERROR_CODE.OTP_INVALID,
  API_ERROR_CODE.OTP_EXPIRED,
  API_ERROR_CODE.OTP_LOCKED,
]);

type Busy = 'send' | 'verify' | 'reset';

/** Minh hoạ 120 của mỗi bước (web `.illustration`). */
const ILLUSTRATION = 120;
/** Vạch tiến trình: cao 4, bo tròn (web `.progressStep`). */
const PROGRESS_BAR_HEIGHT = 4;

/**
 * Quên mật khẩu bằng SĐT (ADR 0060) — bản native của web `MarketForgotPassword` (site partner:
 * `PartnerForgotPasswordView`; site khách: hộp tài khoản), BA BƯỚC + tấm "Thành công!":
 *
 *   1. SĐT đã đăng ký → gửi mã `password_reset`. Server trả NHƯ NHAU dù số có tài khoản hay không,
 *      nên bước 2 luôn mở — không màn nào nói "số này chưa đăng ký".
 *   2. Nhập mã → XÁC MINH NGAY (`verify-otp`) để mã sai bị báo ở chính bước mã.
 *   3. Mật khẩu mới + xác nhận → `reset-otp` với mã đã xác minh. Mã chết ⇒ về bước 2.
 *
 * Xong là XONG, không tự đăng nhập: "Đăng nhập" đưa về màn đăng nhập. App Partner ẩn ba vạch tiến
 * trình như site partner (`hideProgress`); app khách hiện vạch như hộp tài khoản site khách — vạch
 * của bước ĐÃ QUA bấm được để quay lại. Nút chính nằm ngay dưới ô như Figma (không dính đáy).
 */
export function ForgotPasswordScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const errorCodeMessage = useErrorCodeMessage();
  const otp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET);
  const showProgress = APP_PROFILE.clientApp !== MOBILE_CLIENT_APP.PARTNER;

  const [step, setStep] = useState<ForgotStep>(FORGOT_STEP.PHONE);
  const [phone, setPhone] = useState('');
  /** Số đã nhận mã gần nhất — bấm lại "Gửi mã" cho đúng số này trong lúc chờ thì không gửi thêm. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  /** Mã server đã xác nhận ở bước 2 — quay lại bước 2 rồi bấm tiếp thì không xác minh lại. */
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [done, setDone] = useState(false);

  async function requestCode(nextPhone: string) {
    if (busy) return;
    setError(null);
    if (sentTo === nextPhone && otp.cooldown > 0) {
      setPhone(nextPhone);
      setStep(FORGOT_STEP.CODE);
      return;
    }
    setBusy('send');
    try {
      // Môi trường nhận mã test không tốn SMS: sang thẳng bước mã.
      if (!otp.testCodeEnabled) await otp.sendAsync(nextPhone);
      setSentTo(nextPhone);
      if (nextPhone !== phone) setVerifiedCode(null);
      setPhone(nextPhone);
      setCode('');
      setStep(FORGOT_STEP.CODE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmCode(submitted: string) {
    if (busy || otp.codeDead || submitted.length !== OTP_POLICY.CODE_LENGTH) return;
    setError(null);
    if (submitted === verifiedCode) {
      setStep(FORGOT_STEP.PASSWORD);
      return;
    }
    setBusy('verify');
    try {
      await otp.verifyAsync(phone, submitted);
      setVerifiedCode(submitted);
      setStep(FORGOT_STEP.PASSWORD);
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(null);
    }
  }

  /** Gửi lại mã MỚI — không xoá `verifiedCode` (web: mã đã xác minh còn hiệu lực tới hết cửa sổ). */
  async function resendCode() {
    if (busy || otp.sending) return;
    setError(null);
    try {
      await otp.sendAsync(phone);
      setSentTo(phone);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function savePassword(values: ResetPasswordValues) {
    if (busy) return;
    if (!verifiedCode) {
      setStep(FORGOT_STEP.CODE);
      setError(errorCodeMessage(API_ERROR_CODE.OTP_EXPIRED));
      return;
    }
    setError(null);
    setBusy('reset');
    try {
      await resetPasswordWithOtp(phone, verifiedCode, values.password);
      setDone(true);
    } catch (err) {
      const code = getErrorCode(err);
      if (code && DEAD_CODE_ERRORS.has(code)) {
        setVerifiedCode(null);
        setCode('');
        setStep(FORGOT_STEP.CODE);
        // Khoá / hết hạn ⇒ bước mã mở ra với ô mã đã khoá, chỉ còn "Gửi lại mã".
        otp.noteCodeError(err);
      }
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function goToStep(target: ForgotStep) {
    if (busy) return;
    setError(null);
    setStep(target);
  }

  const progress = showProgress ? (
    <StepProgress step={step} disabled={busy !== null} onBack={goToStep} />
  ) : null;

  return (
    <>
      {step === FORGOT_STEP.PHONE ? (
        <PhoneStep
          defaultPhone={phone}
          sending={busy === 'send'}
          error={error}
          onSubmit={(value) => void requestCode(value)}
          onBackToLogin={onBackToLogin}
          progress={progress}
        />
      ) : step === FORGOT_STEP.CODE ? (
        <CodeStep
          phone={phone}
          code={code}
          onCodeChange={(next) => {
            if (error) setError(null);
            setCode(next);
          }}
          verifying={busy === 'verify'}
          locked={otp.codeDead}
          error={error}
          devCode={otp.devCode}
          cooldown={otp.cooldown}
          resending={otp.sending}
          onSubmit={(value) => void confirmCode(value)}
          onResend={() => void resendCode()}
          onBackToLogin={onBackToLogin}
          progress={progress}
        />
      ) : (
        <PasswordStep
          saving={busy === 'reset'}
          error={error}
          onSubmit={(values) => void savePassword(values)}
          onBackToLogin={onBackToLogin}
          progress={progress}
        />
      )}

      <SuccessSheet
        open={done}
        title={t('market.forgot.done.title')}
        body={t.rich('market.forgot.done.body', {
          strong: (chunks: ReactNode) => <Text fow={fontWeight.semibold}>{chunks}</Text>,
        })}
        actionLabel={t('market.forgot.done.submit')}
        onAction={onBackToLogin}
      />
    </>
  );
}

/**
 * Khung chung của một bước — Figma Partner-XePrime "Forgot Password" (`24486:79614` · `24486:79984` ·
 * `24486:80053`): mũi tên lui (về Đăng nhập) · khe 24 · cột khe 32 gồm minh hoạ 120 · tiêu đề 20/30
 * đậm IN HOA + lời dẫn 14/20 (khe 2) · ô nhập · nút vàng + dòng phụ (khe 8) NGAY DƯỚI ô như bản vẽ
 * (người dùng chốt 20/11/2026: màn tài khoản ngắn giữ vị trí nút của Figma, không dính đáy) · vạch
 * tiến trình (app khách).
 */
function StepFrame({
  image,
  title,
  caps,
  sub,
  onBackToLogin,
  actions,
  progress,
  children,
}: {
  image: ImageProps['source'];
  title: string;
  caps: boolean;
  sub: ReactNode;
  onBackToLogin: () => void;
  actions: ReactNode;
  progress: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Screen padded={false} maxWidth="form">
      <FieldAppearanceProvider value="v2">
        <YStack gap={space.xl} px={layout.padXLg} py={space.lg}>
          <BackArrow onPress={onBackToLogin} />
          <YStack gap={COLUMN_GAP}>
            <Image
              source={image}
              style={styles.illustration}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessible={false}
            />
            <YStack ai="center" gap={2}>
              <Text
                col={colors.text}
                fos={TITLE.fontSize}
                lh={TITLE.lineHeight}
                fow={fontWeight.bold}
                ta="center"
                textTransform={caps ? 'uppercase' : 'none'}
                accessibilityRole="header"
              >
                {title}
              </Text>
              <Text
                col={colors.placeholder}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                ta="center"
              >
                {sub}
              </Text>
            </YStack>
            {children}
            {actions}
            {progress}
          </YStack>
        </YStack>
      </FieldAppearanceProvider>
    </Screen>
  );
}

/** Figma `20px/Bold` - tiêu đề mỗi bước. */
const TITLE = { fontSize: 20, lineHeight: 30 } as const;
/** Figma: minh hoạ ↔ tiêu đề ↔ ô ↔ nút cách nhau 32. */
const COLUMN_GAP = 32;

/** Câu lỗi dưới ô (web `.fieldError`): 14/20, màu lỗi, đọc ngay. */
function StepError({ message }: { message: string | null }) {
  const colors = useColors();
  if (!message) return null;
  return (
    <Text
      col={colors.danger}
      fos={typeScale.body.fontSize}
      lh={typeScale.body.lineHeight}
      accessibilityRole="alert"
    >
      {message}
    </Text>
  );
}

/** Bước 1 — số điện thoại đã đăng ký. */
function PhoneStep({
  defaultPhone,
  sending,
  error,
  onSubmit,
  onBackToLogin,
  progress,
}: {
  defaultPhone: string;
  sending: boolean;
  error: string | null;
  onSubmit: (phone: string) => void;
  onBackToLogin: () => void;
  progress: ReactNode;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  // Nhận số chép từ danh bạ (có dấu cách/chấm) như ô đăng nhập — gửi đi ở dạng gọn.
  const schema = useMemo(() => yup.object({ phone: buildLoginPhoneSchema(labels) }), [labels]);
  const { control, handleSubmit } = useForm<{ phone: string }>({
    resolver: yupResolver(schema),
    defaultValues: { phone: defaultPhone },
  });
  const submit = () =>
    void handleSubmit((values) => onSubmit(compactPhoneInput(values.phone.trim())))();

  return (
    <StepFrame
      image={images.forgotLock}
      title={t('market.forgot.phone.title')}
      caps
      sub={t('market.forgot.phone.sub')}
      onBackToLogin={onBackToLogin}
      progress={progress}
      actions={
        <YStack gap={space.sm}>
          <Button
            label={t('market.forgot.phone.submit')}
            bold
            variant="gradient"
            size="lg"
            onPress={submit}
            loading={sending}
          />
          <AuthSwitchLink
            size="lg"
            prompt={t('market.forgot.phone.remembered')}
            actionLabel={t('market.forgot.phone.backToLogin')}
            onPress={onBackToLogin}
            disabled={sending}
          />
        </YStack>
      }
    >
      <YStack gap={space.md}>
        <TextField
          control={control}
          name="phone"
          label={t('login.phone')}
          // Figma: ô KHÔNG nhãn - nhãn chỉ còn là tên cho trình đọc màn hình.
          hideLabel
          placeholder={t('login.phonePlaceholder')}
          icon="person-outline"
          keyboardType="phone-pad"
          autoComplete="tel"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!sending}
        />
        <StepError message={error} />
      </YStack>
    </StepFrame>
  );
}

/** Bước 2 — sáu ô mã. Gõ đủ sáu số là tự gửi. */
function CodeStep({
  phone,
  code,
  onCodeChange,
  verifying,
  locked,
  error,
  devCode,
  cooldown,
  resending,
  onSubmit,
  onResend,
  onBackToLogin,
  progress,
}: {
  phone: string;
  code: string;
  onCodeChange: (code: string) => void;
  verifying: boolean;
  /** Mã đã bị server huỷ — khoá ô mã và nút gửi, chỉ còn "Gửi lại mã". */
  locked: boolean;
  error: string | null;
  devCode: string | null;
  cooldown: number;
  resending: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBackToLogin: () => void;
  progress: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Auth.market.forgot.code');
  const tApp = useTranslations('Auth.market.forgot.partnerApp');
  const tOtp = useTranslations('Auth.otp');
  const codeRef = useRef<TextInput | null>(null);

  // Bấm "Xác nhận" khi chưa đủ sáu số ⇒ đưa con trỏ về ô mã (web `submitCodeOrFocus`).
  const submit = () => {
    if (code.length === OTP_POLICY.CODE_LENGTH) onSubmit(code);
    else codeRef.current?.focus();
  };

  return (
    <StepFrame
      image={images.otpLock}
      title={t('title')}
      caps
      sub={t.rich('sub', {
        br: () => '\n',
        b: (chunks: ReactNode) => (
          <Text col={colors.text} fow={fontWeight.medium}>
            {chunks}
          </Text>
        ),
        phone: maskPhoneStars(phone),
      })}
      onBackToLogin={onBackToLogin}
      progress={progress}
      actions={
        <YStack gap={space.sm}>
          <Button
            label={t('submit')}
            bold
            variant="gradient"
            size="lg"
            onPress={submit}
            loading={verifying}
            disabled={locked}
          />
          <AuthSwitchLink
            size="lg"
            prompt={t('noCode')}
            actionLabel={
              cooldown > 0
                ? tApp('resendIn', { time: formatOtpCooldown(cooldown) })
                : tApp('resend')
            }
            onPress={onResend}
            disabled={cooldown > 0 || resending || verifying}
          />
        </YStack>
      }
    >
      <YStack gap={space.sm}>
        <OtpCodeInput
          inputRef={codeRef}
          value={code}
          onChange={onCodeChange}
          onComplete={onSubmit}
          disabled={verifying || locked}
          autoFocus
        />
        <StepError message={error} />
        {devCode ? (
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} ta="center">
            {tOtp('devCode', { code: devCode })}
          </Text>
        ) : null}
      </YStack>
    </StepFrame>
  );
}

/** Bước 3 — mật khẩu mới + xác nhận. */
function PasswordStep({
  saving,
  error,
  onSubmit,
  onBackToLogin,
  progress,
}: {
  saving: boolean;
  error: string | null;
  onSubmit: (values: ResetPasswordValues) => void;
  onBackToLogin: () => void;
  progress: ReactNode;
}) {
  const t = useTranslations('Auth');
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildResetPasswordSchema(labels), [labels]);
  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: yupResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const submit = () => void handleSubmit(onSubmit)();

  return (
    <StepFrame
      image={images.resetShield}
      title={t('market.forgot.password.title')}
      caps
      sub={t('market.forgot.password.sub')}
      onBackToLogin={onBackToLogin}
      progress={progress}
      actions={
        <Button
          label={t('market.forgot.password.submit')}
          bold
          variant="gradient"
          size="lg"
          onPress={submit}
          loading={saving}
        />
      }
    >
      <YStack gap={space.md}>
        <TextField
          control={control}
          name="password"
          label={t('market.forgot.partnerApp.password')}
          required
          placeholder={t('market.forgot.partnerApp.passwordPlaceholder')}
          icon="lock-closed-outline"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          autoFocus
          editable={!saving}
        />
        <TextField
          control={control}
          name="confirmPassword"
          label={t('market.forgot.partnerApp.confirmPassword')}
          required
          placeholder={t('register.confirmPasswordPlaceholder')}
          icon="lock-closed-outline"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!saving}
        />
        <StepError message={error} />
      </YStack>
    </StepFrame>
  );
}

/** Ba vạch: vạch đã tới tô vàng; vạch của bước ĐÃ QUA bấm được để quay lại (web `StepProgress`). */
function StepProgress({
  step,
  disabled,
  onBack,
}: {
  step: ForgotStep;
  disabled: boolean;
  onBack: (step: ForgotStep) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Auth.market.forgot');
  return (
    <XStack
      gap={space.sm}
      accessibilityRole="progressbar"
      accessibilityLabel={t('progress', { current: step, total: STEPS.length })}
    >
      {STEPS.map((n) => {
        const reached = n <= step;
        const bar = (
          <YStack
            h={PROGRESS_BAR_HEIGHT}
            br={radius.pill}
            bg={reached ? colors.primary : colors.surfaceMuted}
          />
        );
        return n < step ? (
          <Pressable
            key={n}
            style={styles.progressItem}
            onPress={() => onBack(n)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('backToStep', { step: n })}
            hitSlop={space.sm}
          >
            {bar}
          </Pressable>
        ) : (
          <YStack key={n} f={1} accessible={false}>
            {bar}
          </YStack>
        );
      })}
    </XStack>
  );
}

const styles = StyleSheet.create({
  illustration: { alignSelf: 'center', height: ILLUSTRATION, width: ILLUSTRATION },
  progressItem: { flex: 1 },
});
