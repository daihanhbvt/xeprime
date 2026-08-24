import { yupResolver } from '@hookform/resolvers/yup';
import { loginSchema, type LoginValues } from '@xeprime/validators';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useLogin } from '@/features/auth/hooks/use-auth';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const login = useLogin();

  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: yupResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, { onSuccess });
  });

  return (
    <View style={styles.form}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('modal.loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('modal.loginSub')}</Text>
      </View>

      <TextField
        control={control}
        name="identifier"
        label={t('login.identifier')}
        placeholder={t('login.identifierPlaceholder')}
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
        editable={!login.isPending}
      />

      <TextField
        control={control}
        name="password"
        label={t('login.password')}
        placeholder={t('login.passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!login.isPending}
      />

      {login.isError ? <Text style={styles.error}>{errorMessage(login.error)}</Text> : null}

      <Button label={t('login.submit')} onPress={onSubmit} loading={login.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  header: {
    gap: space.xs,
    marginBottom: space.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.sm,
    color: colors.danger,
    fontSize: fontSize.body,
    padding: space.sm,
  },
});
