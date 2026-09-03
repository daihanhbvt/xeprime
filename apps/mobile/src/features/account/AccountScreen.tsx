import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useLogout } from '@/features/auth/hooks/use-auth';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ShopEntryCard } from '@/features/shell/ShopEntryCard';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { ROUTES } from '@/navigation/routes';

/**
 * Tab "Tài khoản" (CUS-04) + đăng xuất (AUTH-07).
 *
 * Cổng phiên nằm ở `app/(tabs)/account.tsx` (`RequireSession`), nên màn này luôn có người dùng
 * và dùng `useAuthenticatedUser()`. Phiên chết GIỮA LÚC màn đang mở cũng được cổng đó bắt: nó
 * đọc cùng một `useCurrentUser`, nên query chuyển sang lỗi 401 là cây con này bị thay ngay.
 */
export function AccountScreen() {
  const t = useTranslations('Account');
  const tNav = useTranslations('Navigation.public');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const user = useAuthenticatedUser();
  const { tenant } = useTenantScope();
  const domainLabel = useDomainLabel();
  const logout = useLogout();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const roleLabel = user.platformRole
    ? domainLabel('platformRole', user.platformRole)
    : tenant
      ? domainLabel('tenantRole', tenant.roleKey)
      : null;

  return (
    // Màn gốc của tab: thanh tab đã nuốt `insets.bottom` — xem ghi chú ở `TripsScreen`.
    <Screen edges={['left', 'right']}>
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

        {roleLabel ? (
          <XStack gap={space.xs} flexWrap="wrap">
            <Chip label={roleLabel} icon="shield-checkmark-outline" />
            {tenant ? <Chip label={tenant.name} icon="storefront-outline" /> : null}
          </XStack>
        ) : null}

        <ShopEntryCard />

        <Card lift="flat" padded={false}>
          <XStack ai="center" jc="space-between" gap={space.sm} p={space.md}>
            <XStack ai="center" gap={space.sm} f={1}>
              <Ionicons name="language-outline" size={iconSize.sm} color={colors.textMuted} />
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
          onPress={() => setConfirmingLogout(true)}
        />
      </YStack>

      {/* Đăng xuất là thao tác không hỏi lại được sau khi làm — hỏi trước, bằng hộp của app. */}
      <AlertDialog
        open={confirmingLogout}
        title={tNav('logout')}
        message={t('logoutConfirm')}
        confirmLabel={tNav('logout')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={logout.isPending}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace(ROUTES.explore.home()),
          })
        }
      />
    </Screen>
  );
}
