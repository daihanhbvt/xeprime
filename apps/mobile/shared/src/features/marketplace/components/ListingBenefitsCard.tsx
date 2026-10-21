import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Thẻ "Tự nhận xe" — bản native của `ListingBenefitsCard` web (Figma `19707:83510`).
 *
 * Không hứa điều chiếc xe không có: "tối ưu theo giờ" chỉ khi xe niêm yết giá giờ, "không cần chờ
 * chủ xe duyệt" chỉ khi xe bật Đặt ngay cho tự lái — điều kiện của web develop.
 * "Cách thức hoạt động" mở trang giới thiệu — cùng đích `ROUTES.ABOUT` của web.
 */
export function ListingBenefitsCard({
  listing,
  activeService,
}: {
  listing: PublicListingDetail;
  activeService: string;
}) {
  const colors = useColors();
  const t = useTranslations('Listings.detail.benefits');
  const navigateOnce = useNavigateOnce();
  // Đúng điều kiện web develop: chỉ ở tab Tự lái; "giá giờ" khi xe có giá giờ, "không cần chờ duyệt"
  // khi xe bật Đặt ngay cho TỰ LÁI. Không còn gì để nói thì không vẽ thẻ.
  if (activeService !== SERVICE_TYPE.SELF_DRIVE) return null;
  const lines = [
    ...(listing.hourlyPrice ? [t('items.hourly')] : []),
    ...((listing.instantBookServiceTypes ?? []).some((type) => type === SERVICE_TYPE.SELF_DRIVE)
      ? [t('items.noWait')]
      : []),
  ];
  if (lines.length === 0) return null;

  return (
    <YStack
      gap={space.sm}
      p={space.md}
      br={radius.lg}
      bw={1}
      bc={colors.primaryMuted}
      bg={colors.surface}
    >
      <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
        {t('title')}
      </Text>
      {lines.map((line) => (
        <XStack key={line} ai="flex-start" gap={space.sm}>
          <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.success} />
          <Text f={1} col={colors.text} fos={fontSize.bodySm}>
            {line}
          </Text>
        </XStack>
      ))}
      <Pressable
        onPress={() => navigateOnce(ROUTES.content.about())}
        accessibilityRole="link"
        hitSlop={space.sm}
      >
        <XStack ai="center" gap={space.xs}>
          <Text col={colors.primary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('howItWorks')}
          </Text>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.primary} />
        </XStack>
      </Pressable>
    </YStack>
  );
}
