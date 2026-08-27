import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { type CurrentUser } from '@/features/auth/api';
import { LOGIN_METHOD, type LoginMethod } from './post-login-destination';
import { Screen } from '@/components/layout/Screen';
import { APP_NAME } from '@/lib/app-name';
import { colors, fontSize, space } from '@/theme/tokens';
import { AUTH_METHOD, AuthMethodTabs, type AuthMethod } from './components/AuthMethodTabs';
import { AuthSwitchLink } from './components/AuthSwitchLink';
import { LoginForm } from './components/LoginForm';
import { OtpLoginForm } from './components/OtpLoginForm';
import { SocialButtons } from './components/SocialButtons';

/**
 * Màn đăng nhập (AUTH-01/03/04) — ba đường vào, một tài khoản.
 *
 * Web trình bày đăng nhập bằng modal đè lên marketplace; native phải là màn hình độc lập — một
 * hộp thoại có ô nhập trên điện thoại vừa bị bàn phím che vừa không có chỗ cho nút quay lại.
 *
 * Nghiệp vụ KHÔNG đổi so với `AuthPanel` của web: cùng hai tab (mật khẩu / OTP), cùng hai
 * provider, cùng quy tắc khoá, cùng mã lỗi. Khác đúng một chỗ và nằm gọn trong
 * `lib/auth-session.ts` — native nhận cặp Bearer (ADR 0017) thay cho session cookie (ADR 0002).
 *
 * Logo chỉ xuất hiện MỘT lần, ở header. Trước đây màn này còn một logo 56px canh giữa ngay
 * trong nội dung — hai lần cùng một dấu hiệu cách nhau 80px, và cái thứ hai không nói thêm gì.
 *
 * Đăng ký (AUTH-02) và quên mật khẩu (AUTH-05) là hai màn RIÊNG; màn này chỉ dẫn sang, y như
 * web dẫn sang `/register` và `/forgot-password`.
 */
export function LoginScreen({
  onSuccess,
  onForgotPassword,
  onSwitchToRegister,
  onCancel,
}: {
  /** Nhận hồ sơ + đường đã dùng — route quyết định đi đâu, màn này không biết luật đó. */
  onSuccess: (user: CurrentUser, method: LoginMethod) => void;
  onForgotPassword: () => void;
  onSwitchToRegister: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Auth');
  const [method, setMethod] = useState<AuthMethod>(AUTH_METHOD.PASSWORD);

  return (
    <>
      {/* Header giữ BrandMark — đó là lần DUY NHẤT logo xuất hiện trên màn này. */}
      <AppHeader onBack={onCancel} />

      {/* Header tự cộng inset trên, nên `Screen` chỉ giữ ba cạnh còn lại. */}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.xl}>
          <YStack gap={space.xs}>
            {/*
              Tên thương hiệu không đi qua i18n — giống nhau ở mọi ngôn ngữ, đúng lý do
              `AUTH_PROVIDER_LABEL` giữ "Google"/"Facebook" ở dạng hằng.

              `primaryActive` chứ không `primary`: `primary` trên nền trắng chỉ đạt ~2.1:1,
              dưới ngưỡng đọc được.
            */}
            <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2}>
              {t('modal.loginTitle')} <Text col={colors.primaryActive}>{APP_NAME}</Text>
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('modal.loginSub')}
            </Text>
          </YStack>

          <YStack gap={space.md}>
            <AuthMethodTabs value={method} onChange={setMethod} />

            {/* Đổi tab là dựng lại form: state của tab kia nói về một lần đăng nhập khác. */}
            {method === AUTH_METHOD.PASSWORD ? (
              <LoginForm
                onSuccess={(user) => onSuccess(user, LOGIN_METHOD.PASSWORD)}
                onForgotPassword={onForgotPassword}
              />
            ) : (
              <OtpLoginForm onSuccess={(user) => onSuccess(user, LOGIN_METHOD.OTP)} />
            )}
          </YStack>

          <SocialButtons onSuccess={(user) => onSuccess(user, LOGIN_METHOD.SOCIAL)} />

          <AuthSwitchLink
            prompt={t('switchMode.noAccount')}
            actionLabel={t('switchMode.toRegister')}
            onPress={onSwitchToRegister}
          />
        </YStack>
      </Screen>
    </>
  );
}

