import { useMutation } from '@tanstack/react-query';
import { yupResolver } from '@hookform/resolvers/yup';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@xeprime/validators';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { TextField } from '@/components/ui/TextField';
import { requestPasswordReset } from '@/features/auth/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * AUTH-05 bước 1 — xin liên kết đặt lại mật khẩu (bản native của
 * `apps/web/src/app/(auth)/forgot-password/page.tsx`).
 *
 * Màn báo thành công cho MỌI email hợp lệ, kể cả email chưa có tài khoản — backend cũng trả 204
 * như nhau. Đó là chống dò tài khoản, không phải chỗ chưa xử lý lỗi; đừng "sửa" thành "email
 * không tồn tại".
 *
 * Liên kết trong email trỏ tới WEB (`APP_WEB_URL/reset-password?token=…`). Máy đã bật App Links
 * / Universal Links sẽ mở thẳng `ResetPasswordScreen`; máy chưa bật thì mở trình duyệt — cả hai
 * đường gọi cùng một endpoint.
 */
export function ForgotPasswordScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<ForgotPasswordValues>({
    mode: 'onChange',
    resolver: yupResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const request = useMutation({
    mutationFn: (values: ForgotPasswordValues) => requestPasswordReset(values.email),
    onSuccess: (_data, values) => setSentTo(values.email),
    onError: (error) => toast.showError(errorMessage(error)),
  });

  const onSubmit = handleSubmit((values) => request.mutate(values));

  if (sentTo) {
    return (
      <>
        <AppHeader onBack={onBackToLogin} />
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack ai="center" gap={space.lg}>
            <StatusIcon icon="mail-open-outline" tone={STATUS_TONE.SUCCESS} />

            <YStack ai="center" gap={space.xs}>
              <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2} ta="center">
                {t('forgotPassword.sentTitle')}
              </Text>
              {/* Rich text của ICU, không nối ba mảnh chuỗi: vị trí địa chỉ email trong câu khác
                  nhau giữa hai ngôn ngữ. */}
              <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                {t.rich('forgotPassword.sentBody', {
                  email: sentTo,
                  strong: (chunks) => (
                    <Text col={colors.text} fow={fontWeight.semibold}>
                      {chunks}
                    </Text>
                  ),
                })}
              </Text>
            </YStack>

            <Button label={t('links.backToLogin')} onPress={onBackToLogin} />
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
            <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2}>
              {t('forgotPassword.title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('forgotPassword.subtitle')}
            </Text>
          </YStack>

          <TextField
            control={control}
            name="email"
            required
            label={t('fields.email')}
            placeholder={t('fields.emailPlaceholder')}
            icon="mail-outline"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            editable={!request.isPending}
          />

          <YStack gap={space.sm}>
            <Button
              label={t('forgotPassword.submit')}
              onPress={onSubmit}
              loading={request.isPending}
              disabled={!isValid}
            />
            <Button
              label={t('links.backToLogin')}
              variant="ghost"
              onPress={onBackToLogin}
              disabled={request.isPending}
            />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
