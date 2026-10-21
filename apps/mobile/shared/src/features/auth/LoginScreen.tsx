import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MOBILE_CLIENT_APP } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { AppHeader } from '@/components/layout/AppHeader';
import { type CurrentUser } from '@/features/auth/api';
import { Screen } from '@/components/layout/Screen';
import { AppVersion } from '@/components/ui/AppVersion';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { APP_NAME } from '@/lib/app-name';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { AuthSwitchLink } from './components/AuthSwitchLink';
import { LoginForm } from './components/LoginForm';
import { SocialButtons } from './components/SocialButtons';

/**
 * Màn đăng nhập (AUTH-01/04) — SĐT + mật khẩu, hoặc mạng xã hội (ADR 0060: không còn đăng nhập OTP).
 *
 * Web trình bày đăng nhập bằng modal đè lên marketplace; native phải là màn hình độc lập — một
 * hộp thoại có ô nhập trên điện thoại vừa bị bàn phím che vừa không có chỗ cho nút quay lại.
 *
 * Nghiệp vụ KHÔNG đổi so với `AuthPanel` của web: định danh CHỈ là SĐT, cùng các
 * provider, cùng quy tắc khoá, cùng mã lỗi. Khác đúng một chỗ và nằm gọn trong
 * `lib/auth-session.ts` — native nhận cặp Bearer (ADR 0017) thay cho session cookie (ADR 0002).
 *
 * Logo chỉ xuất hiện MỘT lần, ở header.
 *
 * Đăng ký (AUTH-02) và quên mật khẩu (AUTH-05) là hai màn RIÊNG; màn này chỉ dẫn sang, y như
 * web dẫn sang `/register` và `/forgot-password`.
 */
export function LoginScreen({
  onSuccess,
  onForgotPassword,
  onSwitchToRegister,
  onCancel,
  onContinueAsGuest,
}: {
  /** Nhận hồ sơ — route quyết định đi đâu, màn này không biết luật đó. */
  onSuccess: (user: CurrentUser) => void;
  onForgotPassword: () => void;
  /**
   * Không truyền = ẨN lối "chưa có tài khoản?". Cả hai app đều truyền: từ ADR 0053 app Partner tạo
   * tài khoản ĐỐI TÁC như site partner.
   */
  onSwitchToRegister?: () => void;
  /**
   * Không truyền = ẨN nút lui ở header. XePrime Partner không có khu công khai nào để quay
   * về (màn đăng nhập LÀ màn gốc của app), nên một mũi tên lui ở đó chỉ dẫn tới việc thoát
   * app — còn ở XePrime thì nó đưa người dùng về chợ xe, nơi họ vừa rời đi.
   */
  onCancel?: () => void;
  /**
   * Không truyền = ẨN nút "tiếp tục không đăng nhập". Chỉ XePrime có nó, vì chỉ app đó có khu
   * công khai để tiếp tục vào (chợ xe xem được mà không cần tài khoản); ở XePrime Partner thì
   * không đăng nhập đồng nghĩa không có gì để làm.
   *
   * Tách khỏi `onCancel`: nút lui ở header là "tôi bấm nhầm", còn nút này là một LỰA CHỌN
   * được mời — người dùng phải đọc thấy chữ mới biết mình được phép bỏ qua đăng nhập.
   */
  onContinueAsGuest?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Auth');
  const tNav = useTranslations('Navigation');

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
            <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold}>
              {t('modal.loginTitle')} <Text col={colors.primaryActive}>{APP_NAME}</Text>
            </Text>
            {/*
              Lời dẫn theo APP: XePrime nói về đặt xe và chuyến đi; XePrime Partner dùng đúng
              câu của site partner (`portal.subtitle` — chủ xe cá nhân, gian hàng, nhân viên).
            */}
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t(
                APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER
                  ? 'portal.subtitle'
                  : 'modal.loginSub',
              )}
            </Text>
          </YStack>

          <LoginForm onSuccess={onSuccess} onForgotPassword={onForgotPassword} />

          <SocialButtons onSuccess={onSuccess} />

          {/*
            Cam kết pháp lý đứng NGAY dưới bộ nút đăng nhập, đúng chỗ web đặt nó trong
            `AuthPanel`: app không có chân trang marketplace, nên thiếu dòng này thì cả hai
            đường vào tài khoản không hề dẫn tới điều khoản hay chính sách bảo mật nào.
          */}
          <LegalConsentNote place="auth" />

          {onSwitchToRegister ? (
            <AuthSwitchLink
              prompt={t('switchMode.noAccount')}
              actionLabel={
                // App Partner nói như site partner ("Đăng ký"); app khách giữ "Tạo tài khoản".
                APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER
                  ? t('portal.becomeOwner')
                  : t('switchMode.toRegister')
              }
              onPress={onSwitchToRegister}
            />
          ) : null}

          {onContinueAsGuest ? (
            <AuthSwitchLink
              prompt={t('switchMode.guestPrompt')}
              actionLabel={tNav('public.explore')}
              onPress={onContinueAsGuest}
            />
          ) : null}

          {/* Chưa đăng nhập vẫn đọc được số phiên bản — người kẹt ở màn này là người cần báo lỗi nhất. */}
          <AppVersion />
        </YStack>
      </Screen>
    </>
  );
}
