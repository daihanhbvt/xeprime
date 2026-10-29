import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { usePartnerOffer } from '@/features/list-vehicle/use-partner-offer';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Khoảng thu nhập/tháng quảng bá — cùng số với web `PARTNER_MONTHLY_INCOME_RANGE`. */
const PARTNER_MONTHLY_INCOME_RANGE = { min: 7_000_000, max: 15_000_000 } as const;
const MILLION = 1_000_000;

/**
 * "Hợp tác với XePrime" — bản native của `PartnerInviteCard` web, khuôn `_Nav featured card` của
 * Figma `21860:83510`: ô cúp vàng nhạt, tiêu đề + viên % phí, câu mời, nút gradient, dấu X ẩn thẻ
 * (ẩn trong lượt xem, như web).
 */
export function PartnerInviteCard() {
  const colors = useColors();
  const t = useTranslations('Account.partnerInvite');
  const navigateOnce = useNavigateOnce();
  const offer = usePartnerOffer().data;
  const minPercent = offer?.minOwnerCommissionPercent ?? null;
  const maxPercent = offer?.maxOwnerCommissionPercent ?? null;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <YStack
      gap={12}
      px={space.md}
      py={space.md}
      br={radius.control}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surface}
      accessibilityLabel={t('title')}
    >
      <XStack ai="flex-start" jc="space-between">
        <YStack p={space.sm} br={radius.control} bw={1} bc={colors.primaryMuted} bg={colors.primarySubtle}>
          <LineIcon name="award" size={iconSize.md} color={colors.primary} />
        </YStack>
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel={t('dismiss')}
          hitSlop={space.sm}
        >
          <LineIcon name="close" size={iconSize.md} color={colors.textMuted} />
        </Pressable>
      </XStack>
      <YStack gap={space.xs}>
        <XStack ai="center" gap={space.sm} flexWrap="wrap">
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
          {minPercent !== null && maxPercent !== null ? (
            <YStack px={space.sm} py={2} br={radius.pill} bw={1} bc={colors.primaryMuted} bg={colors.primarySubtle}>
              <Text col={colors.primary} fos={fontSize.label} fow={fontWeight.medium}>
                {minPercent === maxPercent
                  ? t('commissionBadgeFlat', { percent: maxPercent })
                  : t('commissionBadge', { min: minPercent, max: maxPercent })}
              </Text>
            </YStack>
          ) : null}
        </XStack>
        <Text col={colors.textMuted} fos={fontSize.body}>
          {t('body', {
            min: PARTNER_MONTHLY_INCOME_RANGE.min / MILLION,
            max: PARTNER_MONTHLY_INCOME_RANGE.max / MILLION,
          })}
        </Text>
      </YStack>
      <Button label={t('cta')} variant="gradient" onPress={() => navigateOnce(ROUTES.manage.register())} />
    </YStack>
  );
}
