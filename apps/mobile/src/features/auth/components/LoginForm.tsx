import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { buildLoginSchema, type LoginValues } from '@xeprime/validators';
import { useAuthSchemaLabels } from '../use-auth-schema-labels';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { type CurrentUser } from '@/features/auth/api';
import { useLogin } from '@/features/auth/hooks/use-auth';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

interface LoginFormProps {
  /** Nhận cả hồ sơ: đích sau đăng nhập phụ thuộc `hasPassword`, và chỉ nơi gọi mới biết đi đâu. */
  onSuccess: (user: CurrentUser) => void;
  onForgotPassword: () => void;
}

export function LoginForm({ onSuccess, onForgotPassword }: LoginFormProps) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const login = useLogin();

  /*
   * Dựng lại schema khi ngôn ngữ đổi — LUẬT ở `@xeprime/validators`, chỉ câu chữ đi vào từ đây.
   * `useMemo` vì `yupResolver` nhận object mới mỗi nhịp thì RHF xác thực lại toàn form sau từng
   * phím gõ.
   */
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildLoginSchema(labels), [labels]);

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<LoginValues>({
    mode: 'onChange',
    resolver: yupResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess,
      onError: (error) => toast.showError(errorMessage(error)),
    });
  });

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="identifier"
        required
        label={t('login.identifier')}
        placeholder={t('login.identifierPlaceholder')}
        icon="person-outline"
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
        editable={!login.isPending}
      />

      <TextField
        control={control}
        name="password"
        required
        label={t('login.password')}
        placeholder={t('login.passwordPlaceholder')}
        icon="lock-closed-outline"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!login.isPending}
      />

      {/*
        `Pressable` bọc ngoài chứ không phải `onPress` thẳng trên stack Tamagui: `accessibilityRole`
        đặt trên stack Tamagui KHÔNG tới được cây trợ năng, nên trình đọc màn hình mất hẳn nút này.
      */}
      <Pressable
        onPress={onForgotPassword}
        disabled={login.isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: login.isPending }}
        hitSlop={space.sm}
        style={styles.forgot}
      >
        <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('login.forgot')}
        </Text>
      </Pressable>

      {/*
        Trạng thái nút đọc THẲNG từ react-hook-form và TanStack Query — không có `useState` nào
        phản chiếu lại chúng. Một cờ `isButtonDisabled` tự nuôi là một nguồn sự thật thứ hai, và
        nó sai đúng vào lúc khó thấy nhất: khi request hỏng giữa chừng.
      */}
      <Button
        label={t('login.submit')}
        onPress={onSubmit}
        loading={login.isPending}
        disabled={!isValid}
      />
    </YStack>
  );
}

/*
  `alignSelf`/`marginTop` ở lại `StyleSheet`: chúng là style của chính `Pressable` (một view
  React Native), không phải của `Text` bên trong — Tamagui không chạm tới được.

  `marginTop` ÂM để kéo dòng "Quên mật khẩu" sát ô mật khẩu: nó thuộc về ô đó, không phải một
  mục ngang hàng trong khoảng cách `space.md` của cột.
*/
const styles = StyleSheet.create({
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -space.xs,
  },
});
