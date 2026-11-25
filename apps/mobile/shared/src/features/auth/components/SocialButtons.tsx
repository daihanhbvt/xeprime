import Svg, { Path } from 'react-native-svg';
import { APP_FEATURES } from '@/lib/app-features';
import { Ionicons } from '@expo/vector-icons';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_BRAND_COLOR,
  AUTH_PROVIDER_LABEL,
  NATIVE_IDENTITY_PROVIDER,
  NATIVE_IDENTITY_PROVIDER_LABEL,
  type AuthProvider,
  type NativeIdentityProvider,
} from '@xeprime/types';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text as RNText } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useLocale, useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { isAppleSignInAvailable, type CurrentUser } from '@/features/auth/api';
import { useAppleLogin, useSocialLogin } from '@/features/auth/hooks/use-auth';
import type { IconName } from '@/components/ui/Chip';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FONT_FAMILY } from '@/theme/fonts';
import { makeStyles, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, radius, space } from '@/theme/tokens';

/** Độ mờ của nút đang bị chặn — MỘT giá trị cho mọi nút provider. */
const DISABLED_OPACITY = 0.55;

/** Ô cố định để nhãn hai nút thẳng hàng bất kể glyph rộng hẹp thế nào. */
const ICON_BOX = 22;

/**
 * MỌI nút provider (Google, Facebook, Apple) vẽ bằng CÙNG một `ProviderButton` — cùng nền, viền,
 * font, cỡ chữ, chiều cao (chốt 10/11/2026). Nút Apple CHÍNH THỨC (`AppleAuthenticationButton`)
 * đã gỡ: iOS tự vẽ viền và chữ của nó, nên đứng cạnh nút Google không bao giờ khớp (viền Google
 * đậm hơn, hai cỡ chữ khác nhau). Apple HIG CHO PHÉP nút "Sign in with Apple" tự vẽ khi: dùng
 * đúng logo Apple, nền trắng (viền) hoặc đen, chữ hệ thống, cùng cỡ với các nút đăng nhập khác
 * — đúng những gì `ProviderButton` làm. Bấm vẫn đi đúng luồng native (`useAppleLogin`).
 *
 * Nền/chữ trắng/đen thuần là màu BỘ NHẬN DIỆN của các provider, không phải màu XePrime ⇒ không
 * vào token. Viền lấy `colors.borderInput` (cùng viền ô nhập) cho mọi nút.
 */
const PROVIDER_BUTTON_HEIGHT = 44; // sàn vùng chạm HIG; nhỏ hơn `touchTarget` (48) theo yêu cầu 06/11/2026.
const PROVIDER_BUTTON = {
  white: '#FFFFFF',
  black: '#000000',
  height: PROVIDER_BUTTON_HEIGHT,
  fontSize: Math.round(PROVIDER_BUTTON_HEIGHT * 0.38),
} as const;

/**
 * Cỡ glyph theo TỪNG provider — chỉnh bằng mắt trên máy thật, không suy từ hình dạng glyph.
 * Provider thứ ba (Apple Sign-In) nhiều khả năng lại cần một con số khác.
 */
const PROVIDER_ICON: Readonly<Record<AuthProvider, { name: IconName; size: number }>> = {
  [AUTH_PROVIDER.GOOGLE]: { name: 'logo-google', size: 18 },
  [AUTH_PROVIDER.FACEBOOK]: { name: 'logo-facebook', size: 19 },
};
/** Logo Apple (Ionicons `logo-apple`) — glyph cao hơn chữ G nên nhỉnh 1 cỡ để nhìn bằng nhau. */
const APPLE_ICON_SIZE = 19;

// Facebook TẠM ẨN theo `APP_FEATURES` (28/10/2026) — Google vẫn hiện.
const PROVIDERS = APP_FEATURES.facebookLogin
  ? ([AUTH_PROVIDER.GOOGLE, AUTH_PROVIDER.FACEBOOK] as const)
  : ([AUTH_PROVIDER.GOOGLE] as const);

export function SocialButtons({
  onSuccess,
  blocked = false,
  intent = 'login',
  layout = 'stack',
  dividerLabel,
}: {
  /**
   * `row` - các nút đứng NGANG, chia đều, nhãn chỉ là tên provider ("Google", "Facebook"), cao 48,
   * bo 12: cột form Figma Partner-XePrime `24382:23343`. `stack` (mặc định) - mỗi nút một hàng.
   */
  layout?: 'stack' | 'row';
  /** Chữ giữa hai vạch ngăn; mặc định `social.divider`. */
  dividerLabel?: string;
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
  const { scheme } = useAppScheme();
  const styles = useStyles();
  // Nền tối: nút trắng liền khối (viền trắng); nền sáng: nút trắng viền xám như ô nhập.
  const providerSurface = scheme === 'dark' ? styles.buttonOnDark : null;
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

  const row = layout === 'row';
  const labelFor = (provider: string) =>
    row
      ? provider
      : t(intent === 'register' ? 'social.registerWith' : 'social.loginWith', { provider });

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
    <YStack gap={row ? ROW_SECTION_GAP : space.md}>
      <XStack ai="center" gap={row ? space.md : space.sm}>
        <YStack f={1} h={1} bg={row ? colors.surfaceMuted : colors.border} />
        <Text
          col={row ? colors.textPlaceholder : colors.textMuted}
          fos={row ? fontSize.body : fontSize.label}
          {...(row ? { lh: ROW_DIVIDER_LINE_HEIGHT } : {})}
        >
          {dividerLabel ?? t('social.divider')}
        </Text>
        <YStack f={1} h={1} bg={row ? colors.surfaceMuted : colors.border} />
      </XStack>

      {/*
        MỖI PROVIDER MỘT HÀNG ĐẦY ĐỦ (chốt 06/11/2026): cùng bề ngang, cùng chiều cao, cùng bo
        góc và cùng câu "Đăng nhập với …". Apple cũng đi qua `ProviderButton` — xem docblock trên.
      */}
      <XStack gap={row ? space.lg : space.sm} flexDirection={row ? 'row' : 'column'}>
        {PROVIDERS.map((provider) => {
          const label = labelFor(AUTH_PROVIDER_LABEL[provider]);
          return (
            <ProviderButton
              key={provider}
              row={row}
              label={label}
              busy={pending === provider}
              stopped={stopped}
              blocked={blocked}
              surface={providerSurface}
              spinnerColor={AUTH_PROVIDER_BRAND_COLOR[provider]}
              onPress={() => signIn(provider)}
              icon={
                provider === AUTH_PROVIDER.GOOGLE && !stopped ? (
                  // Logo Google CHUẨN bốn màu (người dùng chốt 28/10/2026) — Ionicons chỉ có bản một màu.
                  <GoogleLogo size={row ? ROW_ICON_SIZE : PROVIDER_ICON[provider].size} />
                ) : (
                  <Ionicons
                    name={PROVIDER_ICON[provider].name}
                    size={row ? ROW_ICON_SIZE : PROVIDER_ICON[provider].size}
                    color={stopped ? colors.textDisabled : AUTH_PROVIDER_BRAND_COLOR[provider]}
                  />
                )
              }
            />
          );
        })}

        {/* "Sign in with Apple" CHỈ ở iOS (App Store Guideline 4.8), và chỉ khi máy hỗ trợ. */}
        {appleAvailable ? (
          <ProviderButton
            row={row}
            label={labelFor(NATIVE_IDENTITY_PROVIDER_LABEL[NATIVE_IDENTITY_PROVIDER.APPLE])}
            busy={pending === NATIVE_IDENTITY_PROVIDER.APPLE}
            stopped={stopped}
            blocked={blocked}
            surface={providerSurface}
            spinnerColor={PROVIDER_BUTTON.black}
            onPress={signInApple}
            icon={
              <Ionicons
                name="logo-apple"
                size={row ? ROW_ICON_SIZE : APPLE_ICON_SIZE}
                color={stopped ? colors.textDisabled : PROVIDER_BUTTON.black}
              />
            }
          />
        ) : null}
      </XStack>
    </YStack>
  );
}

/**
 * Kiểu `row` (Figma Partner-XePrime "Login" `24464:24602`): nút cao 44, bo 12, viền
 * `stroke/gray-low300`, biểu tượng 26, nhãn 14/20 đậm vừa `text/gray/medium`; vạch "hoặc đăng nhập
 * bằng" chữ 14/22 `text/gray/very-low`, cách hàng nút 24.
 */
const ROW_BUTTON_HEIGHT = 44;
const ROW_ICON_SIZE = 26;
/** Bản vẽ 24; giảm nhẹ còn 20 để màn đăng nhập gói trong một khung máy (chốt 20/11/2026). */
const ROW_SECTION_GAP = space.lg + space.xs;
const ROW_DIVIDER_LINE_HEIGHT = 22;
/** Nhãn nút kiểu `row`: 14/20 (Figma `24464:24607`). */
const ROW_LABEL_LINE_HEIGHT = 20;

const useStyles = makeStyles((colors) => ({
  button: {
    alignItems: 'center',
    backgroundColor: PROVIDER_BUTTON.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    // `height` cố định (không `minHeight`): mọi nút provider phải cao đúng bằng nhau.
    height: PROVIDER_BUTTON.height,
    justifyContent: 'center',
    borderColor: colors.borderInput,
  },
  buttonOnDark: { borderColor: PROVIDER_BUTTON.white },
  pressed: { opacity: 0.85 },
  label: {
    color: PROVIDER_BUTTON.black,
    // Font HỆ THỐNG như chữ trong nút Apple — font hệ thống nhận `fontWeight` trên cả hai nền tảng.
    fontFamily: FONT_FAMILY.system,
    fontSize: PROVIDER_BUTTON.fontSize,
    fontWeight: '500',
  },
  labelDisabled: { color: colors.textDisabled },
  /*
   * Chưa tick thì nút phải TRÔNG như không bấm được. `disabled` một mình chỉ nuốt cú chạm, và
   * một nút im lặng khi bấm đọc ra là máy treo chứ không phải "còn thiếu một bước ở trên".
   */
  blocked: { borderColor: colors.border, opacity: DISABLED_OPACITY },
  rowButton: { flex: 1, height: ROW_BUTTON_HEIGHT, borderRadius: radius.control },
  /*
   * Kiểu `row` (app Partner) theo Figma: Google Sans Flex Medium 14/20 - font của app, không phải font
   * hệ thống của kiểu `stack`. `fontWeight` về thường: mặt chữ đã là Medium (Android chọn file theo
   * `fontFamily`; giữ '500' thì máy có thể tô đậm giả lên mặt Medium).
   */
  rowLabel: {
    color: colors.textMuted,
    fontFamily: FONT_FAMILY.medium,
    fontSize: fontSize.body,
    fontWeight: 'normal',
    lineHeight: ROW_LABEL_LINE_HEIGHT,
  },
}));

/** Một nút provider — Google, Facebook, Apple dùng chung để trông như MỘT bộ. */
function ProviderButton({
  row = false,
  label,
  icon,
  busy,
  stopped,
  blocked,
  surface,
  spinnerColor,
  onPress,
}: {
  row?: boolean;
  label: string;
  icon: ReactNode;
  busy: boolean;
  stopped: boolean;
  blocked: boolean;
  surface: object | null;
  spinnerColor: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={stopped}
      accessibilityRole="button"
      /*
       * Nhãn khai TƯỜNG MINH, không để trình đọc màn hình tự suy từ chữ bên trong: lúc đang gọi,
       * chữ đứng cạnh một `ActivityIndicator` không có nhãn, và tên khả truy cập suy ra được thì
       * đổi theo trạng thái. Cùng cách `Button` của bộ UI làm.
       */
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: stopped }}
      style={({ pressed }) => [
        styles.button,
        row ? styles.rowButton : null,
        surface,
        pressed ? styles.pressed : null,
        blocked ? styles.blocked : null,
      ]}
    >
      <XStack w={row ? ROW_ICON_SIZE : ICON_BOX} h={row ? ROW_ICON_SIZE : ICON_BOX} ai="center" jc="center">
        {busy ? <ActivityIndicator size="small" color={spinnerColor} /> : icon}
      </XStack>
      <RNText
        numberOfLines={1}
        style={[styles.label, row ? styles.rowLabel : null, stopped ? styles.labelDisabled : null]}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

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
