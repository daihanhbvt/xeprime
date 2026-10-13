import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { API_ERROR_CODE, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { buildOtpLoginSchema, type OtpLoginValues } from '@xeprime/validators';
import { useAuthSchemaLabels } from '../use-auth-schema-labels';
import { useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { useForm, useWatch } from 'react-hook-form';
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
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { getErrorMessage } from '@/lib/get-error-message';
import { getErrorCode } from '@/lib/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * Mã về KHÔNG GIAN TÀI KHOẢN — câu của server là tiếng Việt cố định; dịch theo MÃ để giao diện
 * tiếng Anh không lẫn tiếng Việt đúng lúc người dùng được bảo dùng app/cách đăng nhập khác.
 *
 * Ba mã cổng phạm vi app cũ server KHÔNG còn phát từ ADR 0053 (realm của app đã quyết tài khoản);
 * giữ để một API cũ hơn app vẫn được dịch đúng.
 */
const APP_GATE_CODES: ReadonlySet<string> = new Set([
  API_ERROR_CODE.REALM_NOT_ALLOWED,
  API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED,
  API_ERROR_CODE.CUSTOMER_APP_NOT_AVAILABLE,
  API_ERROR_CODE.PARTNER_ACCESS_REQUIRED,
  API_ERROR_CODE.PARTNER_REGISTRATION_NOT_SUPPORTED,
]);

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
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const [code, setCode] = useState('');
  const codeInputRef = useRef<TextInput>(null);

  const vp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.LOGIN);
  const login = useOtpLogin();

  /*
   * Dựng lại schema khi ngôn ngữ đổi — LUẬT ở `@xeprime/validators`, chỉ câu chữ đi vào từ đây.
   * `useMemo` vì `yupResolver` nhận object mới mỗi nhịp thì RHF xác thực lại toàn form sau từng
   * phím gõ.
   */
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildOtpLoginSchema(labels), [labels]);

  const {
    control,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<OtpLoginValues>({
    // Xem docblock cùng chỗ ở `LoginForm`: nút khoá theo `isValid` nên phải validate real-time.
    mode: 'onChange',
    resolver: yupResolver(schema),
    defaultValues: { phone: '' },
  });

  const sent = vp.status === 'code_sent';
  const phone = useWatch({ control, name: 'phone' }).trim();
  // Môi trường mã test cho nhập mã trước khi gửi ⇒ SĐT phải hợp lệ mới đăng nhập được (như web).
  const canSubmit = code.length === OTP_LENGTH && isValid && !login.isPending;

  // `sendAsync` chứ không `send`: chờ được thì `isSubmitting` mới bật, và đó là thứ khoá nút.
  const sendCode = handleSubmit(async (values) => {
    try {
      await vp.sendAsync(values.phone.trim());
      toast.showSuccess(t('otp.sent'));
    } catch (error) {
      // Câu của backend đã mang sẵn số giây còn phải đợi — xem `useErrorMessage`.
      toast.showError(getErrorMessage(error));
    }
  });

  function submitCode(next = code) {
    if (next.length !== OTP_LENGTH || !isValid || login.isPending) return;
    login.mutate(
      { phone, code: next },
      {
        onSuccess,
        onError: (error) =>
          toast.showError(
            APP_GATE_CODES.has(getErrorCode(error) ?? '')
              ? errorMessage(error)
              : getErrorMessage(error),
          ),
      },
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
        // Môi trường mã test: ô mã đã hiện trước khi gửi ⇒ phím của bàn phím chuyển sang ô mã chứ
        // không phát SMS — gửi thật vẫn có nút "Gửi mã xác thực" riêng.
        returnKeyType={vp.canEnterCode && !sent ? 'next' : 'send'}
        onSubmitEditing={() => {
          if (vp.canEnterCode && !sent) codeInputRef.current?.focus();
          else void sendCode();
        }}
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
          {...(vp.canEnterCode ? { variant: 'secondary' as const } : {})}
        />
      ) : null}

      {vp.canEnterCode ? (
        <>
          <YStack gap={space.xs}>
            {sent ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('otp.codeHint', { phone: maskPhone(phone) })}
              </Text>
            ) : null}
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={submitCode}
              disabled={login.isPending}
              autoFocus={sent}
              inputRef={codeInputRef}
            />
          </YStack>

          {vp.devCode ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('otp.devCode', { code: vp.devCode })}
            </Text>
          ) : !sent ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('otp.testCodeHint')}
            </Text>
          ) : null}

          <Button
            label={t('otp.submit')}
            icon="checkmark-outline"
            onPress={() => submitCode()}
            loading={login.isPending}
            disabled={!canSubmit}
          />
        </>
      ) : null}

      {sent ? (
        <>
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
      ) : null}
    </YStack>
  );
}
