import Svg, { Path } from 'react-native-svg';
import { APP_FEATURES } from '@/lib/app-features';
import { Ionicons } from '@expo/vector-icons';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_BRAND_COLOR,
  AUTH_PROVIDER_LABEL,
  NATIVE_IDENTITY_PROVIDER,
  type AuthProvider,
  type NativeIdentityProvider,
} from '@xeprime/types';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useLocale, useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { isAppleSignInAvailable, type CurrentUser } from '@/features/auth/api';
import { useAppleLogin, useSocialLogin } from '@/features/auth/hooks/use-auth';
import type { IconName } from '@/components/ui/Chip';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FONT_FAMILY } from '@/theme/fonts';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, radius, sizing, space } from '@/theme/tokens';

/** Độ mờ của nút đang bị chặn — MỘT giá trị cho cả nút Google/Facebook lẫn nút Apple. */
const DISABLED_OPACITY = 0.55;

/** Ô cố định để nhãn hai nút thẳng hàng bất kể glyph rộng hẹp thế nào. */
const ICON_BOX = 20;

/**
 * Cỡ glyph theo TỪNG provider — chỉnh bằng mắt trên máy thật, không suy từ hình dạng glyph.
 * Provider thứ ba (Apple Sign-In) nhiều khả năng lại cần một con số khác.
 */
const PROVIDER_ICON: Readonly<Record<AuthProvider, { name: IconName; size: number }>> = {
  [AUTH_PROVIDER.GOOGLE]: { name: 'logo-google', size: 19 },
  [AUTH_PROVIDER.FACEBOOK]: { name: 'logo-facebook', size: 19 },
};

// Facebook TẠM ẨN theo `APP_FEATURES` (28/10/2026) — Google vẫn hiện.
const PROVIDERS = APP_FEATURES.facebookLogin
  ? ([AUTH_PROVIDER.GOOGLE, AUTH_PROVIDER.FACEBOOK] as const)
  : ([AUTH_PROVIDER.GOOGLE] as const);

export function SocialButtons({
  onSuccess,
  blocked = false,
  intent = 'login',
}: {
  onSuccess: (user: CurrentUser) => void;
  /** Nhãn nút theo màn — "Đăng nhập với …" hay "Đăng ký với …", như `AuthPanel` web (ADR 0060). */
  intent?: 'login' | 'register';
  /**
   * Chặn vì một điều kiện NGOÀI hai nút — màn đăng ký truyền vào khi chưa tick đồng ý điều
   * khoản. Đăng nhập mạng xã hội LẦN ĐẦU cũng là tạo tài khoản, nên nó phải qua đúng cửa đó.
   */
  blocked?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Auth');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const socialLogin = useSocialLogin();
  const appleLogin = useAppleLogin();
  const [pending, setPending] = useState<AuthProvider | NativeIdentityProvider | null>(null);
  const stopped = pending !== null || blocked;
  /*
   * "Sign in with Apple" CHỈ ở iOS (App Store Guideline 4.8) — Android và web không có. Hỏi hệ
   * điều hành một lần lúc dựng: iOS < 13 hoặc thiết bị bị hạn chế trả `false` và nút không hiện.
   */
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then((ok) => {
      if (alive) setAppleAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Khoá bằng ref, không chỉ bằng state: hai cú chạm nhanh trước lần render kế tiếp đều đọc
   * `stopped = false` và mở HAI bảng đăng nhập của iOS.
   */
  const appleInFlight = useRef(false);

  function signInApple() {
    if (stopped || appleInFlight.current) return;
    appleInFlight.current = true;
    setPending(NATIVE_IDENTITY_PROVIDER.APPLE);
    appleLogin.mutate(undefined, {
      onSuccess: (user) => user && onSuccess(user),
      onError: (error) => toast.showError(errorMessage(error)),
      onSettled: () => {
        appleInFlight.current = false;
        setPending(null);
      },
    });
  }

  function signIn(provider: AuthProvider) {
    setPending(provider);
    socialLogin.mutate(
      { provider, locale },
      {
        onSuccess: (user) => user && onSuccess(user),
        onError: (error) => toast.showError(errorMessage(error)),
        onSettled: () => setPending(null),
      },
    );
  }

  return (
    <YStack gap={space.md}>
      <XStack ai="center" gap={space.sm}>
        <YStack f={1} h={1} bg={colors.border} />
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('social.divider')}
        </Text>
        <YStack f={1} h={1} bg={colors.border} />
      </XStack>

      {/*
        MỘT HÀNG, các ô chia đều (`f={1}`). Nhãn chữ chuyển vào `accessibilityLabel`: xếp
        ngang thì không còn chỗ cho "Tiếp tục với Facebook" mà không cắt chữ, và cắt chữ tên
        thương hiệu là thứ tệ hơn hẳn việc bỏ nó đi.
      */}
      <XStack gap={space.sm}>
        {PROVIDERS.map((provider) => {
          const busy = pending === provider;
          const label = t(intent === 'register' ? 'social.registerWith' : 'social.loginWith', {
            provider: AUTH_PROVIDER_LABEL[provider],
          });
          return (
            <Pressable
              key={provider}
              onPress={() => signIn(provider)}
              disabled={stopped}
              accessibilityRole="button"
              /*
               * Nhãn khai TƯỜNG MINH, không để trình đọc màn hình tự suy từ chữ bên trong: lúc
               * đang gọi, chữ đứng cạnh một `ActivityIndicator` không có nhãn, và tên khả truy cập
               * suy ra được thì đổi theo trạng thái. Cùng cách `Button` của bộ UI làm.
               */
              accessibilityLabel={label}
              accessibilityState={{ busy, disabled: stopped }}
              style={({ pressed }) => [
                styles.button,
                pressed ? styles.pressed : null,
                blocked ? styles.blocked : null,
              ]}
            >
              {busy ? (
                <XStack w={ICON_BOX} h={ICON_BOX} ai="center" jc="center">
                  <ActivityIndicator size="small" color={AUTH_PROVIDER_BRAND_COLOR[provider]} />
                </XStack>
              ) : (
                <XStack w={ICON_BOX} h={ICON_BOX} ai="center" jc="center">
                  {provider === AUTH_PROVIDER.GOOGLE && !stopped ? (
                    // Logo Google CHUẨN bốn màu (người dùng chốt 28/10/2026) — Ionicons chỉ có bản một màu.
                    <GoogleLogo size={PROVIDER_ICON[provider].size} />
                  ) : (
                    <Ionicons
                      name={PROVIDER_ICON[provider].name}
                      size={PROVIDER_ICON[provider].size}
                      color={stopped ? colors.textDisabled : AUTH_PROVIDER_BRAND_COLOR[provider]}
                    />
                  )}
                </XStack>
              )}
              <RNText style={[styles.label, stopped ? styles.labelDisabled : null]}>
                {AUTH_PROVIDER_LABEL[provider]}
              </RNText>
            </Pressable>
          );
        })}
      </XStack>

      {/*
        Nút CHÍNH THỨC của Apple (HIG bắt buộc khi duyệt app): Apple tự vẽ logo + chữ "Tiếp tục
        với Apple" theo ngôn ngữ máy, nên không có khoá dịch nào ở đây. Đứng riêng một hàng dưới
        hai provider kia — ép nó vào ô 1/3 bề ngang thì chữ của Apple bị cắt.
      */}
      {appleAvailable ? (
        <YStack opacity={stopped ? DISABLED_OPACITY : 1} pointerEvents={stopped ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.pill}
            style={styles.apple}
            onPress={signInApple}
          />
        </YStack>
      ) : null}
    </YStack>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderInput,
    borderRadius: radius.pill,
    borderWidth: 1,
    // `flex: 1` để hai (hoặc ba) ô chia đều bề ngang — thêm provider không phải tính lại gì.
    flex: 1,
    flexDirection: 'row',
    gap: space.xs,
    justifyContent: 'center',
    minHeight: sizing.touchTarget,
  },
  pressed: { opacity: 0.85 },
  apple: { height: sizing.touchTarget, width: '100%' },
  label: {
    color: colors.text,
    // `RNText` (không phải `Text` của Tamagui) ⇒ không nhận font mặc định; khai tường minh.
    // Mặt chữ đậm lấy bằng FILE, không bằng `fontWeight` — Android bỏ qua nó khi có font riêng.
    fontFamily: FONT_FAMILY.semibold,
    fontSize: fontSize.bodySm,
  },
  labelDisabled: { color: colors.textDisabled },
  /*
   * Chưa tick thì nút phải TRÔNG như không bấm được. `disabled` một mình chỉ nuốt cú chạm, và
   * một nút im lặng khi bấm đọc ra là máy treo chứ không phải "còn thiếu một bước ở trên".
   */
  blocked: { borderColor: colors.border, opacity: DISABLED_OPACITY },
}));

/** Chữ "G" bốn màu của Google (bộ nhận diện chính thức, viewBox 48). */
function GoogleLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FBBC05"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#EA4335"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#34A853"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#4285F4"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}
