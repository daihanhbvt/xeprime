import { yupResolver } from '@hookform/resolvers/yup';
import { loginSchema, type LoginValues } from '@xeprime/validators';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<LoginValues>({
    mode: 'onChange',
    resolver: yupResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess,
      onError: (error) => toast.showError(errorMessage(error)),
    });
  });

  return (
    <View style={styles.form}>
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

      <Pressable
        onPress={onForgotPassword}
        disabled={login.isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: login.isPending }}
        hitSlop={space.sm}
        style={styles.forgot}
      >
        <Text style={styles.forgotLabel}>{t('login.forgot')}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -space.xs,
  },
  forgotLabel: {
    color: colors.primaryActive,
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
});
