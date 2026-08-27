import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { otpLoginSchema, type OtpLoginValues } from '@xeprime/validators';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { type CurrentUser } from '@/features/auth/api';
import { useOtpLogin } from '@/features/auth/hooks/use-auth';
import { OtpCodeInput, OTP_LENGTH } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/**
 * Đăng nhập passwordless bằng SĐT + OTP — cùng nghiệp vụ với `PhoneLoginForm` của web: nhập SĐT →
 * gửi mã (purpose `login`, không dùng chéo mục đích) → nhập mã → đăng nhập. Tài khoản chưa có sẽ
 * được backend tạo ngầm, không mật khẩu.
 *
 * SĐT đi qua React Hook Form (validate + báo lỗi ngay dưới ô), còn mã 6 số giữ ở state màn:
 * `OtpCodeInput` không phải một ô nhập thường mà là một control có `onComplete`, và nhét nó vào
 * form chỉ để lấy một chuỗi 6 ký tự là thêm một lớp không trả lại gì.
 */
export function OtpLoginForm({ onSuccess }: { onSuccess: (user: CurrentUser) => void }) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const [code, setCode] = useState('');

  const vp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.LOGIN);
  const login = useOtpLogin();

  const {
    control,
    handleSubmit,
    getValues,
    formState: { isValid, isSubmitting },
  } = useForm<OtpLoginValues>({
    // Xem docblock cùng chỗ ở `LoginForm`: nút khoá theo `isValid` nên phải validate real-time.
    mode: 'onChange',
    resolver: yupResolver(otpLoginSchema),
    defaultValues: { phone: '' },
  });

  const sent = vp.status === 'code_sent';
  const phone = getValues('phone').trim();

  // `sendAsync` chứ không `send`: chờ được thì `isSubmitting` mới bật, và đó là thứ khoá nút.
  const sendCode = handleSubmit(async (values) => {
    try {
      await vp.sendAsync(values.phone.trim());
      toast.showSuccess(t('otp.sent'));
    } catch (error) {
      // Câu của backend đã mang sẵn số giây còn phải đợi — xem `useErrorMessage`.
      toast.showError(errorMessage(error));
    }
  });

  function submitCode(next = code) {
    if (next.length !== OTP_LENGTH || login.isPending) return;
    login.mutate(
      { phone, code: next },
      { onSuccess, onError: (error) => toast.showError(errorMessage(error)) },
    );
  }

  function editPhone() {
    vp.reset();
    login.reset();
    setCode('');
  }

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="phone"
        required
        label={t('otp.phone')}
        placeholder={t('otp.phonePlaceholder')}
        icon="call-outline"
        keyboardType="phone-pad"
        autoComplete="tel"
        returnKeyType="send"
        onSubmitEditing={sendCode}
        // Chú thích tắt sau khi gửi: lúc đó nó đã thành sự thật, giữ lại là nói thừa.
        {...(sent ? {} : { hint: t('otp.phoneHint') })}
        // Khoá ô sau khi gửi: mã đã phát cho SỐ NÀY: đổi số mà giữ mã là gửi mã của người khác.
        editable={!sent && !isSubmitting}
      />

      {!sent ? (
        // Nhãn phải nói ra lý do khoá khi đang đếm ngược — nút chỉ mờ đi thì người dùng bấm
        // lại vài lần rồi kết luận app hỏng.
        <Button
          label={vp.cooldown > 0 ? t('otp.resendIn', { seconds: vp.cooldown }) : t('otp.sendCode')}
          onPress={sendCode}
          loading={isSubmitting}
          disabled={!isValid || vp.cooldown > 0}
        />
      ) : (
        <>
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('otp.codeHint', { phone: maskPhone(phone) })}
            </Text>
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={submitCode}
              disabled={login.isPending}
              autoFocus
            />
          </YStack>

          {vp.devCode ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('otp.devCode', { code: vp.devCode })}
            </Text>
          ) : null}

          <Button
            label={t('otp.submit')}
            onPress={() => submitCode()}
            loading={login.isPending}
            disabled={code.length !== OTP_LENGTH}
          />

          {/*
            Hai hành động khác nhau về LOẠI phần tử, không chỉ về màu: "Đổi số" luôn là nút, còn
            "Gửi lại" là dòng chữ trạng thái khi đang đếm và chỉ thành nút khi gửi lại được.
          */}
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Button label={t('otp.editPhone')} variant="ghost" block={false} onPress={editPhone} />

            {vp.cooldown > 0 ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="time-outline" size={iconSize.xs} color={colors.textMuted} />
                <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {t('otp.resendIn', { seconds: vp.cooldown })}
                </Text>
              </XStack>
            ) : (
              <Button
                label={t('otp.resend')}
                variant="ghost"
                block={false}
                onPress={sendCode}
                loading={isSubmitting}
              />
            )}
          </XStack>
        </>
      )}
    </YStack>
  );
}
