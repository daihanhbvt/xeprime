import { yupResolver } from '@hookform/resolvers/yup';
import { loginSchema, type LoginValues } from '@xeprime/validators';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useLogin } from '@/features/auth/hooks/use-auth';
import { useAuthErrorMessage } from '@/features/auth/hooks/use-auth-error-message';
import { colors } from '@/theme/colors';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const t = useTranslations('Auth.login');
  const tCommon = useTranslations('Common.actions');
  const authErrorMessage = useAuthErrorMessage();
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
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      <TextField
        control={control}
        name="identifier"
        label={t('identifierLabel')}
        placeholder={t('identifierPlaceholder')}
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
        editable={!login.isPending}
      />

      <TextField
        control={control}
        name="password"
        label={t('passwordLabel')}
        placeholder={t('passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!login.isPending}
      />

      {login.isError ? <Text style={styles.error}>{authErrorMessage(login.error)}</Text> : null}

      <Button label={tCommon('login')} onPress={onSubmit} loading={login.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 16,
  },
  header: {
    gap: 4,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 8,
    color: colors.dangerText,
    fontSize: 14,
    padding: 12,
  },
});
