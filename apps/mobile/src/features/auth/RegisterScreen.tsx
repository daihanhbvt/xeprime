import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { type CurrentUser } from '@/features/auth/api';
import { APP_NAME } from '@/lib/app-name';
import { colors, fontSize, space } from '@/theme/tokens';
import { AuthSwitchLink } from './components/AuthSwitchLink';
import { RegisterForm } from './components/RegisterForm';
import { RegisterSuccess } from './components/RegisterSuccess';
import { SocialButtons } from './components/SocialButtons';

/**
 * Đăng ký tài khoản khách bằng SĐT + mật khẩu (AUTH-02).
 *
 * Nghiệp vụ y hệt nhánh `mode === REGISTER` của `AuthPanel` bên web: cùng bốn ô, cùng
 * `registerSchema`, cùng hai nút mạng xã hội, và cùng bước "tạo xong thì chọn đi đâu".
 *
 * Trạng thái "đã tạo xong" là state TRONG màn này, không phải route mới — giống web
 * (`AuthModal` giữ `registered` trong cùng dialog). Phiên đã được cấp ở bước trước, nên nút lui
 * biến mất ở trạng thái đó: lui về form là mời một người đã đăng nhập tạo tài khoản lần hai.
 */
export function RegisterScreen({
  onAuthenticated,
  onRegistered,
  onOpenAccount,
  onSwitchToLogin,
  onCancel,
}: {
  /** Đăng nhập mạng xã hội — tài khoản có thể đã tồn tại, nên KHÔNG đi qua màn "vừa tạo xong". */
  onAuthenticated: (user: CurrentUser) => void;
  /** Vừa tạo tài khoản mới xong và chọn "Tiếp tục". */
  onRegistered: () => void;
  onOpenAccount: () => void;
  onSwitchToLogin: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Auth');
  const [registered, setRegistered] = useState(false);

  return (
    <>
      <AppHeader {...(registered ? {} : { onBack: onCancel })} />

      <Screen edges={['left', 'right', 'bottom']}>
        {registered ? (
          <RegisterSuccess onContinue={onRegistered} onOpenAccount={onOpenAccount} />
        ) : (
          <YStack gap={space.xl}>
            <YStack gap={space.xs}>
              <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2}>
                {t('modal.registerTitle')} <Text col={colors.primaryActive}>{APP_NAME}</Text>
              </Text>
              <Text col={colors.textMuted} fos={fontSize.body}>
                {t('modal.registerSub')}
              </Text>
            </YStack>

            <RegisterForm onSuccess={() => setRegistered(true)} />

            <SocialButtons onSuccess={onAuthenticated} />

            <AuthSwitchLink
              prompt={t('switchMode.hasAccount')}
              actionLabel={t('switchMode.toLogin')}
              onPress={onSwitchToLogin}
            />
          </YStack>
        )}
      </Screen>
    </>
  );
}
