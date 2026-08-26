import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Screen } from '@/components/layout/Screen';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useCurrentUser, useLogout } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { ROUTES } from '@/navigation/routes';

/**
 * Tab "Tài khoản" (CUS-04).
 *
 * Tab này có cổng ở `(tabs)/_layout.tsx`, nhưng vẫn tự xử lý trường hợp chưa đăng nhập: phiên
 * có thể chết NGAY TRONG LÚC màn đang mở (refresh token bị từ chối, admin khoá) — lúc đó không
 * có cú chạm nào để cổng kịp chặn.
 */
export function AccountScreen() {
  const t = useTranslations('Account');
  const tNav = useTranslations('Navigation.public');
  const router = useRouter();
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();

  if (isPending) {
    return (
      <Screen>
        <ProfileSkeleton />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen scroll={false}>
        <ScreenMessage
          title={t('signInRequired')}
          actionLabel={t('signIn')}
          onAction={() => router.push(ROUTES.account.login())}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <YStack gap={space.lg}>
        <XStack ai="center" gap={space.md}>
          <Avatar name={user.displayName} url={user.avatarUrl} size={64} />
          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} numberOfLines={1}>
              {user.displayName}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
              {user.email ?? user.phone ?? t('noEmail')}
            </Text>
          </YStack>
        </XStack>

        <Card lift="flat" padded={false}>
          <XStack ai="center" jc="space-between" gap={space.sm} p={space.md}>
            <XStack ai="center" gap={space.sm} f={1}>
              <Ionicons name="language-outline" size={18} color={colors.textMuted} />
              <Text col={colors.text} fos={fontSize.body}>
                {t('title')}
              </Text>
            </XStack>
            <LocaleSwitcher />
          </XStack>
        </Card>

        <Button
          label={tNav('logout')}
          variant="danger"
          icon="log-out-outline"
          loading={logout.isPending}
          onPress={() =>
            logout.mutate(undefined, {
              // Về Khám phá dù đăng xuất ở server có lỗi: token trên máy đã bỏ, giữ người dùng
              // lại trong màn tài khoản của một phiên đã chết thì tệ hơn.
              onSettled: () => router.replace(ROUTES.explore.home()),
            })
          }
        />
      </YStack>
    </Screen>
  );
}
