import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { elevation } from '@/theme/elevation';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { IconName } from '@/components/ui/Chip';

export const AUTH_METHOD = {
  PASSWORD: 'password',
  OTP: 'otp',
} as const;

export type AuthMethod = (typeof AUTH_METHOD)[keyof typeof AUTH_METHOD];

const METHOD_ICON: Readonly<Record<AuthMethod, IconName>> = {
  [AUTH_METHOD.PASSWORD]: 'lock-closed-outline',
  [AUTH_METHOD.OTP]: 'chatbubble-ellipses-outline',
};

const METHODS = [AUTH_METHOD.PASSWORD, AUTH_METHOD.OTP] as const;

/**
 * Chọn giữa "Email/SĐT + mật khẩu" và "Đăng nhập OTP" — cùng hai lựa chọn với tab của
 * `AuthPanel` trên web, dùng chung khoá dịch `Auth.tabs.*` nên hai nền tảng không gọi khác tên.
 *
 * Là một dải phân đoạn chứ không phải tab điều hướng: hai cách đăng nhập nằm ngang hàng và
 * chuyển qua lại không đi đâu cả, nên không có gì để đẩy vào stack.
 *
 * Track `surfaceMuted` trên nền `background` lệch nhau chưa tới 2% độ sáng, nên ranh giới không
 * thể dựa vào chênh lệch nền — ngoài nắng nó bệt hẳn. Ô đang chọn vì thế tô `primary` đặc, chữ
 * `onPrimary`: cùng cặp màu với nút chính, đọc được ở mọi điều kiện sáng.
 */
export function AuthMethodTabs({
  value,
  onChange,
  disabled = false,
}: {
  value: AuthMethod;
  onChange: (next: AuthMethod) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('Auth');

  return (
    <XStack
      bg={colors.surfaceMuted}
      br={radius.pill}
      bw={1}
      bc={colors.border}
      p={space.xs}
      gap={space.xs}
      accessibilityRole="tablist"
    >
      {METHODS.map((method) => {
        const active = method === value;
        const fg = active ? colors.onPrimary : colors.textMuted;

        return (
          <Pressable
            key={method}
            onPress={() => onChange(method)}
            disabled={disabled || active}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            style={[styles.tab, active ? styles.tabActive : null]}
          >
            <Ionicons name={METHOD_ICON[method]} size={iconSize.sm} color={fg} />
            <Text
              col={fg}
              fos={fontSize.bodySm}
              fow={active ? fontWeight.semibold : fontWeight.regular}
              numberOfLines={1}
            >
              {t(`tabs.${method}`)}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

const styles = StyleSheet.create({
  tab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: space.xs,
    justifyContent: 'center',
    // Trừ đệm của track để vùng chạm thật vẫn đúng sàn 44pt.
    minHeight: sizing.touchTarget - space.xs * 2,
    paddingHorizontal: space.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
    ...elevation.card,
  },
});
