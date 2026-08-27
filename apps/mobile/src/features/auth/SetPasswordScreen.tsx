import { yupResolver } from '@hookform/resolvers/yup';
import { resetPasswordSchema, type ResetPasswordValues } from '@xeprime/validators';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { setAccountPassword } from '@/features/auth/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, space } from '@/theme/tokens';

/**
 * Bước gợi ý đặt mật khẩu sau khi đăng nhập bằng SĐT + OTP — bản native của
 * `apps/web/src/features/auth/components/SetPasswordPrompt.tsx`.
 *
 * Nghiệp vụ giữ NGUYÊN của web: chỉ hiện khi tài khoản chưa có mật khẩu (`hasPassword === false`),
 * dùng cùng `resetPasswordSchema`, gọi cùng `POST /auth/password/set`, và **"Bỏ qua" là bắt
 * buộc** — đặt mật khẩu chỉ để lần sau đăng nhập nhanh hơn, không phải điều kiện để dùng sản
 * phẩm. Đặt xong thì lần sau backend trả `hasPassword: true` và bước này không hiện lại.
 *
 * Khác web đúng một chỗ, và là khác biệt về TRÌNH BÀY: web thay nội dung ngay trong hộp đăng
 * nhập, native là một màn riêng. Trên điện thoại một bước có hai ô nhập cần trọn màn hình để
 * không bị bàn phím nuốt.
 *
 * KHÔNG có nút lui trên header: người dùng đã đăng nhập xong rồi: phiên đã cấp, token đã nằm
 * trong Keychain. Lui về màn đăng nhập ở đây là mời họ đăng nhập lần thứ hai. Lối ra duy nhất
 * là "Bỏ qua" hoặc đặt mật khẩu — cả hai đều dẫn vào app.
 */
export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const t = useTranslations('Auth.setPassword');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<ResetPasswordValues>({
    mode: 'onChange',
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const save = useMutation({
    mutationFn: (values: ResetPasswordValues) => setAccountPassword(values.password),
    onSuccess: () => {
      toast.showSuccess(t('done'));
      onDone();
    },
    onError: (error) => toast.showError(errorMessage(error)),
  });

  const onSubmit = handleSubmit((values) => save.mutate(values));

  return (
    <>
      <AppHeader />

      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.xl}>
          <YStack gap={space.xs}>
            <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2}>
              {t('title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('body')}
            </Text>
          </YStack>

          <YStack gap={space.md}>
            <TextField
              control={control}
              name="password"
              required
              label={t('newPassword')}
              placeholder={t('newPasswordPlaceholderApp')}
              hint={t('rule')}
              icon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!save.isPending}
            />

            <TextField
              control={control}
              name="confirmPassword"
              required
              label={t('confirmPassword')}
              placeholder={t('confirmPasswordPlaceholder')}
              icon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              editable={!save.isPending}
            />

          </YStack>

          <YStack gap={space.sm}>
            <Button
              label={t('submit')}
              onPress={onSubmit}
              loading={save.isPending}
              disabled={!isValid}
            />

            {/* "Bỏ qua" là LỐI RA, không phụ thuộc `isValid` — chỉ khoá lúc đang lưu. */}
            <Button
              label={t('skip')}
              variant="ghost"
              onPress={onDone}
              disabled={save.isPending}
            />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
