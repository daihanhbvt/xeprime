import { Image } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { LoginForm } from './components/LoginForm';

/**
 * Màn đăng nhập (AUTH-01).
 *
 * Web trình bày đăng nhập bằng modal đè lên marketplace; native phải là màn hình độc lập — một
 * hộp thoại có ô nhập trên điện thoại vừa bị bàn phím che vừa không có chỗ cho nút quay lại.
 *
 * Nghiệp vụ KHÔNG đổi: cùng người dùng, cùng mật khẩu, cùng quy tắc khoá, cùng mã lỗi. Khác
 * đúng một chỗ và nằm gọn trong `lib/auth-session.ts` — native gửi `Authorization: Bearer`
 * (ADR 0017) thay cho session cookie của web (ADR 0002).
 *
 * Đăng ký (AUTH-02), OTP (AUTH-03) và đăng nhập mạng xã hội (AUTH-04) là các task riêng.
 */
export function LoginScreen({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Auth');

  return (
    <>
      {/* Header dùng chung của app — xem `components/layout/AppHeader.tsx`, đừng dựng riêng. */}
      <AppHeader onBack={onCancel} />

      {/* Header đã cộng inset trên; `Screen` chỉ còn giữ ba cạnh còn lại. */}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack f={1} jc="center" gap={space.xl} pb={space.xl}>
        <YStack ai="center" gap={space.md}>
          <Image
            source={images.logo}
            style={{ width: 56, height: 56, borderRadius: radius.md }}
            resizeMode="contain"
          />
          <YStack ai="center" gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold}>
              {t('modal.loginTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body} ta="center">
              {t('modal.loginSub')}
            </Text>
          </YStack>
        </YStack>

        {/*
          Chưa có "Quên mật khẩu?" (AUTH-05) và đăng ký (AUTH-02) ở đây: cả hai là task riêng,
          và một liên kết dẫn về chính màn này thì tệ hơn hẳn việc chưa có nó.
        */}
          <LoginForm onSuccess={onSuccess} />
        </YStack>
      </Screen>
    </>
  );
}
