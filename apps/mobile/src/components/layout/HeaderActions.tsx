import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Avatar } from '@/components/ui/Avatar';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

export function HeaderActions() {
  const t = useTranslations('Navigation.public');
  const router = useRouter();
  const { data: user } = useCurrentUser();

  return (
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
  );
}
