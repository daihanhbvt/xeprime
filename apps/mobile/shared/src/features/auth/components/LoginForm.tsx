import { useMemo, type ReactNode } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  LOGIN_IDENTIFIER_KIND,
  MOBILE_CLIENT_APP,
  compactPhoneInput,
  detectLoginIdentifierKind,
  normalizeStaffUsername,
} from '@xeprime/types';
import * as yup from 'yup';
import { buildLoginPhoneSchema, buildPartnerLoginSchema } from '@xeprime/validators';
import { APP_PROFILE } from '@/app-profile';
import { useAuthSchemaLabels } from '../use-auth-schema-labels';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { FieldAppearanceProvider } from '@/components/ui/Field';
import { TextField } from '@/components/ui/TextField';
import { type CurrentUser } from '@/features/auth/api';
import { useLogin } from '@/features/auth/hooks/use-auth';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';

interface LoginFormValues {
  identifier: string;
  password: string;
}

interface LoginFormProps {
  /** Nhận cả hồ sơ: đích sau đăng nhập phụ thuộc `hasPassword`, và chỉ nơi gọi mới biết đi đâu. */
  onSuccess: (user: CurrentUser) => void;
  onForgotPassword: () => void;
  /** Dòng ngay dưới nút đăng nhập, khe 8 (Figma `24382:23384` - "Bạn chưa có tài khoản? Đăng ký ngay!"). */
  belowSubmit?: ReactNode;
}

export function LoginForm({ onSuccess, onForgotPassword, belowSubmit }: LoginFormProps) {
  const colors = useColors();
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
  /*
   * App Partner = site partner: MỘT ô nhận SĐT HOẶC tên đăng nhập nhân viên do chủ gian hàng cấp
   * (ADR 0087), server phân loại theo hình dạng. App khách chỉ nhận SĐT (ADR 0060) — tên đăng nhập
   * ở realm khách bị server từ chối, nên không mời người dùng gõ nó.
   */
  const isPartnerApp = APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER;
  const schema = useMemo(
    () =>
      isPartnerApp
        ? buildPartnerLoginSchema(labels)
        : // Cùng luật `buildPhoneLoginSchema`, chỉ đặt tên ô là `identifier` để hai app chung một form.
          yup.object({
            identifier: buildLoginPhoneSchema(labels),
            password: yup.string().required(labels.passwordRequired),
          }),
    [labels, isPartnerApp],
  );

  const { control, handleSubmit } = useForm<LoginFormValues>({
    mode: 'onChange',
    // Hai nhánh cùng hình `{ identifier, password }` — ép về một kiểu để RHF không thấy hợp hai schema.
    resolver: yupResolver(schema as yup.ObjectSchema<LoginFormValues>),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    // SĐT: bỏ dấu cách/chấm/gạch chép từ danh bạ như web; tên đăng nhập: chữ thường, bỏ khoảng trắng.
    const identifier =
      detectLoginIdentifierKind(values.identifier) === LOGIN_IDENTIFIER_KIND.USERNAME
        ? normalizeStaffUsername(values.identifier)
        : compactPhoneInput(values.identifier);
    login.mutate(
      { identifier, password: values.password },
      {
        onSuccess,
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  const fields = (
    <>
      <TextField
        control={control}
        name="identifier"
        // Figma Partner "Login" không vẽ dấu `*` ở hai ô (dấu chỉ là hiển thị - luật nằm ở schema).
        required={!isPartnerApp}
        label={t(isPartnerApp ? 'login.partnerIdentifier' : 'login.phone')}
        placeholder={t(
          isPartnerApp ? 'login.partnerIdentifierPlaceholder' : 'login.phonePlaceholder',
        )}
        hint={isPartnerApp ? t('login.partnerIdentifierHint') : undefined}
        icon={isPartnerApp ? 'person-outline' : 'call-outline'}
        autoCapitalize="none"
        autoComplete={isPartnerApp ? 'username' : 'tel'}
        keyboardType={isPartnerApp ? 'default' : 'phone-pad'}
        editable={!login.isPending}
      />

      <TextField
        control={control}
        name="password"
        required={!isPartnerApp}
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
    </>
  );

  /*
    `Pressable` bọc ngoài chứ không phải `onPress` thẳng trên stack Tamagui: `accessibilityRole`
    đặt trên stack Tamagui KHÔNG tới được cây trợ năng, nên trình đọc màn hình mất hẳn nút này.
  */
  const forgot = (
    <Pressable
      onPress={onForgotPassword}
      disabled={login.isPending}
      accessibilityRole="button"
      accessibilityState={{ disabled: login.isPending }}
      hitSlop={space.sm}
      style={isPartnerApp ? styles.forgotV2 : styles.forgot}
    >
      <Text
        col={isPartnerApp ? colors.brandLink : colors.primaryActive}
        fos={isPartnerApp ? typeScale.body.fontSize : fontSize.bodySm}
        {...(isPartnerApp ? { lh: typeScale.body.lineHeight } : {})}
        fow={fontWeight.semibold}
      >
        {t('login.forgot')}
      </Text>
    </Pressable>
  );

  /*
    Trạng thái nút đọc THẲNG từ react-hook-form và TanStack Query — không có `useState` nào
    phản chiếu lại chúng. Một cờ `isButtonDisabled` tự nuôi là một nguồn sự thật thứ hai, và
    nó sai đúng vào lúc khó thấy nhất: khi request hỏng giữa chừng.
  */
  if (isPartnerApp) {
    /*
      Figma Partner-XePrime "Login" (`24464:24587` · `24464:24593`): bộ ô `v2`, khe ô 16, "Quên mật
      khẩu?" canh phải ngay dưới ô mật khẩu; cách 24 là nút gradient cao 44 và dòng mời đăng ký (khe 8).
      "Ghi nhớ tài khoản" của bản vẽ KHÔNG có trên app (chưa có tính năng nhớ tài khoản ở native).
    */
    return (
      <FieldAppearanceProvider value="v2">
        <YStack gap={space.xl}>
          <YStack gap={space.lg}>
            {fields}
            {forgot}
          </YStack>
          <YStack gap={space.sm}>
            <Button
              label={t('login.submit')}
              variant="gradient"
              size="lg"
              onPress={onSubmit}
              loading={login.isPending}
            />
            {belowSubmit}
          </YStack>
        </YStack>
      </FieldAppearanceProvider>
    );
  }

  return (
    <YStack gap={space.md}>
      {fields}
      {forgot}
      <Button
        label={t('login.submit')}
        icon="log-in-outline"
        onPress={onSubmit}
        loading={login.isPending}
      />
      {belowSubmit}
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
  forgotV2: {
    alignSelf: 'flex-end',
  },
});
