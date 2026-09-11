import { Ionicons } from '@expo/vector-icons';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_BRAND_COLOR,
  AUTH_PROVIDER_LABEL,
  type AuthProvider,
} from '@xeprime/types';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useLocale, useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { type CurrentUser } from '@/features/auth/api';
import { useSocialLogin } from '@/features/auth/hooks/use-auth';
import type { IconName } from '@/components/ui/Chip';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

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

const PROVIDERS = [AUTH_PROVIDER.GOOGLE, AUTH_PROVIDER.FACEBOOK] as const;

export function SocialButtons({
  onSuccess,
  blocked = false,
}: {
  onSuccess: (user: CurrentUser) => void;
  /**
   * Chặn vì một điều kiện NGOÀI hai nút — màn đăng ký truyền vào khi chưa tick đồng ý điều
   * khoản. Đăng nhập mạng xã hội LẦN ĐẦU cũng là tạo tài khoản, nên nó phải qua đúng cửa đó.
   */
  blocked?: boolean;
}) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const socialLogin = useSocialLogin();
  const [pending, setPending] = useState<AuthProvider | null>(null);
  const stopped = pending !== null || blocked;

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

      {PROVIDERS.map((provider) => {
        const busy = pending === provider;
        const label = t('social.continueWith', { provider: AUTH_PROVIDER_LABEL[provider] });
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
                <Ionicons
                  name={PROVIDER_ICON[provider].name}
                  size={PROVIDER_ICON[provider].size}
                  color={stopped ? colors.textDisabled : AUTH_PROVIDER_BRAND_COLOR[provider]}
                />
              </XStack>
            )}
            <RNText style={[styles.label, stopped ? styles.labelDisabled : null]}>{label}</RNText>
          </Pressable>
        );
      })}
    </YStack>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderInput,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.xs,
    justifyContent: 'center',
    minHeight: sizing.touchTarget,
    paddingHorizontal: space.lg,
  },
  pressed: { opacity: 0.85 },
  /*
   * Chưa tick thì nút phải TRÔNG như không bấm được. `disabled` một mình chỉ nuốt cú chạm, và
   * một nút im lặng khi bấm đọc ra là máy treo chứ không phải "còn thiếu một bước ở trên".
   */
  blocked: { borderColor: colors.border, opacity: 0.55 },
  label: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  labelDisabled: { color: colors.textDisabled },
});
