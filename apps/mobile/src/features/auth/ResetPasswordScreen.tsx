import { useMutation } from '@tanstack/react-query';
import { yupResolver } from '@hookform/resolvers/yup';
import { resetPasswordSchema, type ResetPasswordValues } from '@xeprime/validators';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { StatusIcon, STATUS_TONE, type StatusTone } from '@/components/ui/StatusIcon';
import { TextField } from '@/components/ui/TextField';
import { resetPasswordWithToken } from '@/features/auth/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { IconName } from '@/components/ui/Chip';
import { colors, fontSize, space } from '@/theme/tokens';

interface ResetPasswordScreenProps {
  /** `null` khi liên kết thiếu `?token=` — trường hợp HỢP LỆ, không phải lỗi lập trình. */
  token: string | null;
  onRequestNewLink: () => void;
  onBackToLogin: () => void;
}

/**
 * AUTH-05 bước 2 — đặt mật khẩu mới từ token trong email (bản native của
 * `apps/web/src/app/(auth)/reset-password/page.tsx`).
 *
 * Ba trạng thái, đúng ba trạng thái của web: thiếu token → "liên kết không hợp lệ"; có token →
 * form hai ô; đổi xong → màn xác nhận dẫn về đăng nhập.
 *
 * **Không tự đăng nhập sau khi đổi.** Backend chỉ ghi mật khẩu mới và huỷ mọi token còn lại; nó
 * KHÔNG phát phiên (web cũng vậy). Người dùng quay về màn đăng nhập và dùng mật khẩu mới — đó
 * cũng là lần kiểm chứng đầu tiên rằng họ nhớ đúng thứ vừa đặt.
 */
export function ResetPasswordScreen({
  token,
  onRequestNewLink,
  onBackToLogin,
}: ResetPasswordScreenProps) {
  const t = useTranslations('Auth');
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Outcome
        onBack={onBackToLogin}
        icon="link-outline"
        tone={STATUS_TONE.DANGER}
        title={t('resetPassword.invalidTitle')}
        body={t('resetPassword.invalidSubtitle')}
      >
        <Button label={t('resetPassword.requestNew')} onPress={onRequestNewLink} />
        <Button label={t('links.backToLogin')} variant="ghost" onPress={onBackToLogin} />
      </Outcome>
    );
  }

  if (done) {
    return (
      // Không có nút lui: mật khẩu đã đổi, và lui lại chính là gửi lại một token đã chết.
      <Outcome
        icon="checkmark-circle"
        tone={STATUS_TONE.SUCCESS}
        title={t('resetPassword.doneTitle')}
        body={t('resetPassword.doneSubtitle')}
      >
        <Button label={t('links.login')} onPress={onBackToLogin} />
      </Outcome>
    );
  }

  return (
    <ResetPasswordForm token={token} onBack={onBackToLogin} onDone={() => setDone(true)} />
  );
}

function ResetPasswordForm({
  token,
  onBack,
  onDone,
}: {
  token: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('Auth');
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

  const reset = useMutation({
    mutationFn: (values: ResetPasswordValues) => resetPasswordWithToken(token, values.password),
    onSuccess: onDone,
    onError: (error) => toast.showError(errorMessage(error)),
  });

  const onSubmit = handleSubmit((values) => reset.mutate(values));

  return (
    <>
      <AppHeader onBack={onBack} />

      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.xl}>
          <YStack gap={space.xs}>
            <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2}>
              {t('resetPassword.title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('resetPassword.subtitle')}
            </Text>
          </YStack>

          <YStack gap={space.md}>
            <TextField
              control={control}
              name="password"
              required
              label={t('resetPassword.newPassword')}
              placeholder={t('resetPassword.newPasswordPlaceholderApp')}
              hint={t('passwordRule')}
              icon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!reset.isPending}
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
              onSubmitEditing={onSubmit}
              editable={!reset.isPending}
            />
          </YStack>

          <Button
            label={t('resetPassword.submit')}
            onPress={onSubmit}
            loading={reset.isPending}
            disabled={!isValid}
          />
        </YStack>
      </Screen>
    </>
  );
}

function Outcome({
  onBack,
  icon,
  tone,
  title,
  body,
  children,
}: {
  /** Vắng mặt = màn không có đường lui (xem nhánh `done`). */
  onBack?: () => void;
  icon: IconName;
  tone: StatusTone;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader {...(onBack ? { onBack } : {})} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack ai="center" gap={space.lg}>
          <StatusIcon icon={icon} tone={tone} />
          <YStack ai="center" gap={space.xs}>
            <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2} ta="center">
              {title}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body} ta="center">
              {body}
            </Text>
          </YStack>
          <YStack gap={space.sm} w="100%">
            {children}
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
