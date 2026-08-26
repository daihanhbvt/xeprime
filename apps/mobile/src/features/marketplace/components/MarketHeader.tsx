import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Avatar } from '@/components/ui/Avatar';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { ROUTES } from '@/navigation/routes';

/**
 * Header khu công khai.
 *
 * Ba vùng, mỗi vùng một việc: thương hiệu · ngôn ngữ · danh tính. Ngôn ngữ co lại thành một
 * nút tròn để phần bên phải dành cho thứ người dùng thực sự cần thấy — **đăng nhập** khi là
 * khách, **avatar** khi đã có phiên. Khách chưa đăng nhập luôn thấy một CTA màu thương hiệu,
 * không phải một dòng chữ lẫn vào nền.
 *
 * Không dựng lại thanh điều hướng ngang của web: trên native đó là thanh tab dưới đáy.
 */
export function MarketHeader() {
  const t = useTranslations('Navigation.public');
  const router = useRouter();
  const { data: user } = useCurrentUser();

  return (
    <XStack
      ai="center"
      jc="space-between"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      bg={colors.background}
    >
      <XStack ai="center" gap={space.xs}>
        <Image
          source={images.logo}
          style={{ width: 30, height: 30, borderRadius: radius.sm }}
          resizeMode="contain"
        />
        <XStack ai="baseline">
          <Text col={colors.primaryActive} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            xe
          </Text>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.regular}>
            prime
          </Text>
        </XStack>
      </XStack>

      <XStack ai="center" gap={space.xs}>
        <LocaleSwitcher />

        {user ? (
          <Pressable
            onPress={() => router.push(ROUTES.account.home())}
            accessibilityRole="button"
            accessibilityLabel={t('account')}
          >
            <Avatar name={user.displayName} url={user.avatarUrl} size={sizing.touchTarget} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push(ROUTES.account.login())}
            accessibilityRole="button"
            accessibilityLabel={t('login')}
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
          >
            <XStack
              ai="center"
              gap={space.xs}
              bg={colors.primary}
              br={radius.pill}
              px={space.md}
              minHeight={sizing.touchTarget}
            >
              <Ionicons name="person-circle-outline" size={18} color={colors.onPrimary} />
              <Text col={colors.onPrimary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('login')}
              </Text>
            </XStack>
          </Pressable>
        )}
      </XStack>
    </XStack>
  );
}
