import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressScale } from '@/components/motion/PressableScale';
import { useScrollRevealDefault } from '@/components/motion/ScrollReveal';
import { useRevealPop } from '@/components/motion/reveal-effects';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { Avatar } from '@/components/ui/Avatar';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useAccountIdentityLabel } from '../use-account-identity-label';

/**
 * Thẻ hồ sơ GỌN đầu trang Tài khoản — Figma `21860:83495`: ảnh 56, tên 20 Semibold, vai 14 xám,
 * bút sửa ở mép phải. Chạm vào đâu cũng mở "Quản lý tài khoản" (nơi sửa tên/ảnh/liên hệ thật).
 */
export function AccountHubCard() {
  const colors = useColors();
  const t = useTranslations('Account');
  const tNav = useTranslations('Navigation');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  // Ảnh đại diện nảy lên khi thẻ hiện + thẻ co nhẹ khi nhấn (app khách; Partner giữ tĩnh).
  const avatarPop = useRevealPop(140, 0.7, false);
  const press = usePressScale(useScrollRevealDefault(), 0.98);
  if (!user) return null;

  const name = user.displayName || user.email || t('profile.accountLabel');

  return (
    <Pressable
      onPress={() => navigateOnce(ROUTES.account.profile())}
      accessibilityRole="button"
      accessibilityLabel={tNav('account.profile')}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
      <XStack
        ai="center"
        gap={12}
        p={space.md}
        br={radius.card}
        bw={1}
        bc={colors.borderSubtle}
        bg={colors.surface}
      >
        <Animated.View style={avatarPop}>
          <Avatar name={name} url={user.avatarUrl ?? null} size={56} />
        </Animated.View>
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} numberOfLines={1}>
            {name}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body} numberOfLines={1}>
            {identityLabel(user)}
          </Text>
        </YStack>
        <LineIcon name="edit" size={iconSize.md} color={colors.textMuted} />
      </XStack>
      </Animated.View>
    </Pressable>
  );
}
