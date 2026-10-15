import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import {
  buildResetPasswordByPhoneSchema,
  type ResetPasswordByPhoneValues,
} from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { TextField } from '@/components/ui/TextField';
import { resetPasswordWithOtp } from '@/features/auth/api';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useAuthSchemaLabels } from './use-auth-schema-labels';

const isOtpCodeComplete = (code: string): boolean => /^[0-9]{6}$/.test(code);

/**
 * Quên mật khẩu bằng SỐ ĐIỆN THOẠI (ADR 0060) — MỘT màn, giống hệt web `ForgotPasswordByPhone`, dùng
 * ở cả app XePrime lẫn XePrime Partner (realm do server suy từ app gọi):
 *
 *   SĐT · mật khẩu mới · nhập lại → "Xác nhận" → gửi mã `password_reset` + sheet nhập mã →
 *   đúng mã ⇒ `POST /auth/password/reset-otp` → "Đã đặt lại mật khẩu".
 *
 * Hai điều cố ý, giống web:
 *  - Câu trong sheet nói "NẾU số này có tài khoản…": server trả như nhau dù số có tài khoản hay
 *    không, nên giao diện cũng không được khẳng định điều đó.
 *  - Xong là XONG, không tự đăng nhập: người dùng đăng nhập lại bằng SĐT + mật khẩu vừa đặt.
 */
export function ForgotPasswordScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const t = useTranslations('Auth');
  const tCommon = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const labels = useAuthSchemaLabels();
  const otp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET);

  /** Giá trị form của lượt đang chờ mã — sheet mở khi khác null. */
  const [draft, setDraft] = useState<ResetPasswordByPhoneValues | null>(null);
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const schema = useMemo(() => buildResetPasswordByPhoneSchema(labels), [labels]);
  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<ResetPasswordByPhoneValues>({
    mode: 'onChange',
    resolver: yupResolver(schema),
    defaultValues: { phone: '', password: '', confirmPassword: '' },
  });

  /** "Xác nhận": gửi mã rồi mở sheet. Môi trường nhận mã test thì không tốn SMS. */
  const confirm = async (values: ResetPasswordByPhoneValues) => {
    if (sending) return;
    setSending(true);
    try {
      if (!otp.testCodeEnabled) await otp.sendAsync(values.phone.trim());
      setCode('');
      setOtpError(null);
      setDraft(values);
    } catch (error) {
      // Cooldown, quá số lần gửi… — báo ngay, ở lại màn.
      toast.showError(errorMessage(error));
    } finally {
      setSending(false);
    }
  };
  // `handleSubmit` gọi lúc bấm — không dựng callback đọc state lúc render.
  const onConfirm = () => void handleSubmit(confirm)();

  const reset = async (value: string) => {
    if (!draft || submitting || !isOtpCodeComplete(value)) return;
    setSubmitting(true);
    setOtpError(null);
    try {
      await resetPasswordWithOtp(draft.phone.trim(), value, draft.password);
      setDraft(null);
      setDone(true);
    } catch (error) {
      // Sai/hết hạn mã: ở lại sheet cho nhập lại.
      setOtpError(errorMessage(error));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!draft) return;
    setOtpError(null);
    try {
      await otp.sendAsync(draft.phone.trim());
      setCode('');
    } catch (error) {
      setOtpError(errorMessage(error));
    }
  };

  if (done) {
    return (
      <>
        <AppHeader onBack={onBackToLogin} />
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack ai="center" gap={space.lg}>
            <StatusIcon icon="checkmark-circle-outline" tone={STATUS_TONE.SUCCESS} />
            <YStack ai="center" gap={space.xs}>
              <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold} ta="center">
                {t('forgotPhone.doneTitle')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                {t('forgotPhone.doneBody')}
              </Text>
            </YStack>
            <Button label={t('links.login')} onPress={onBackToLogin} />
          </YStack>
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader onBack={onBackToLogin} />

      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.xl}>
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold}>
              {t('forgotPassword.title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('forgotPhone.subtitle')}
            </Text>
          </YStack>

          <YStack gap={space.md}>
            <TextField
              control={control}
              name="phone"
              required
              label={t('login.phone')}
              placeholder={t('login.phonePlaceholder')}
              icon="call-outline"
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!sending}
            />
            <TextField
              control={control}
              name="password"
              required
              label={t('resetPassword.newPassword')}
              placeholder={t('resetPassword.newPasswordPlaceholderApp')}
              icon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!sending}
            />
            <TextField
              control={control}
              name="confirmPassword"
              required
              label={t('resetPassword.confirmPassword')}
              placeholder={t('resetPassword.confirmPasswordPlaceholder')}
              icon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={onConfirm}
              editable={!sending}
            />
          </YStack>

          <YStack gap={space.sm}>
            <Button
              label={tCommon('confirm')}
              icon="checkmark-outline"
              onPress={onConfirm}
              loading={sending}
              disabled={!isValid}
            />
            <Button
              label={t('links.backToLogin')}
              variant="ghost"
              onPress={onBackToLogin}
              disabled={sending}
            />
          </YStack>
        </YStack>
      </Screen>

      <BottomSheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={t('register.verifyTitle')}
        footer={
          <Button
            label={t('resetPassword.submit')}
            icon="key-outline"
            loading={submitting}
            disabled={!isOtpCodeComplete(code)}
            onPress={() => void reset(code)}
          />
        }
      >
        <YStack gap={space.md}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('forgotPhone.sentHint', { phone: maskPhone(draft?.phone.trim() ?? '') })}
          </Text>
          <OtpCodeInput
            value={code}
            onChange={(next) => {
              if (otpError) setOtpError(null);
              setCode(next);
            }}
            onComplete={(full) => void reset(full)}
            disabled={submitting}
            autoFocus
          />
          {otpError ? <Callout tone="danger">{otpError}</Callout> : null}
          <XStack jc="center">
            <Button
              label={
                otp.cooldown > 0 ? t('otp.resendIn', { seconds: otp.cooldown }) : t('otp.resend')
              }
              variant="ghost"
              block={false}
              loading={otp.sending}
              disabled={otp.cooldown > 0 || submitting}
              onPress={() => void resend()}
            />
          </XStack>
        </YStack>
      </BottomSheet>
    </>
  );
}
