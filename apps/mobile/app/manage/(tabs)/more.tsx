import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { ScopeSwitcherSheet } from '@/features/shell/ScopeSwitcher';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, iconSize, space } from '@/theme/tokens';

/**
 * Ngăn "Thêm" của khu quản lý.
 *
 * Đợt này chỉ có lối về chế độ khách và bộ đổi ngôn ngữ — các mục quản lý khác (xe, lịch, tài
 * chính, nhân sự) mở dần ở những đợt sau. Nói thẳng điều đó bằng một câu còn hơn để một ngăn
 * trống mà người dùng tưởng là lỗi.
 */
export default function ManageMoreRoute() {
  const t = useTranslations('MobileShell.more');
  const tAccount = useTranslations('Account');
  const tMissing = useTranslations('Bookings.missingKm');
  const permissions = usePermissions();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  return (
    <>
      <ManageHeader />
      <ManagePageTitle title={t('title')} />
      <Screen edges={['left', 'right', 'bottom']}>
        <Card onPress={() => setSwitching(true)} accessibilityLabel={t('switchScope')}>
          <XStack ai="center" gap={space.md}>
            <Ionicons
              name="swap-horizontal-outline"
              size={iconSize.lg}
              color={colors.primaryActive}
            />
            <Text f={1} col={colors.text} fos={fontSize.body}>
              {t('switchScope')}
            </Text>
            <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textMuted} />
          </XStack>
        </Card>

        {permissions.has(PERMISSION.HANDOVER_VIEW) ? (
          <Card
            onPress={() => router.push(ROUTES.manage.missingOdometer())}
            accessibilityLabel={tMissing('open')}
          >
            <XStack ai="center" gap={space.md}>
              <Ionicons name="warning-outline" size={iconSize.lg} color={colors.warning} />
              <Text f={1} col={colors.text} fos={fontSize.body}>
                {tMissing('open')}
              </Text>
              <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textMuted} />
            </XStack>
          </Card>
        ) : null}

        <Card lift="flat" padded={false}>
          <XStack ai="center" jc="space-between" gap={space.sm} p={space.md}>
            <XStack ai="center" gap={space.sm} f={1}>
              <Ionicons name="language-outline" size={iconSize.sm} color={colors.textMuted} />
              <Text col={colors.text} fos={fontSize.body}>
                {tAccount('title')}
              </Text>
            </XStack>
            <LocaleSwitcher />
          </XStack>
        </Card>

        <YStack px={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('comingSoon')}
          </Text>
        </YStack>
      </Screen>

      <ScopeSwitcherSheet open={switching} onClose={() => setSwitching(false)} />
    </>
  );
}
