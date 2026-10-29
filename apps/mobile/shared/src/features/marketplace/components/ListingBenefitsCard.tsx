import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space } from '@/theme/tokens';

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
    /*
     * `.card` web ≤640px (Figma `19771:72529`): viền `primary-accent`, bo `card` 16, đệm 16, nền
     * gradient 247° `primary-subtle` → nền thẻ; tiêu đề + "Cách thức hoạt động" cùng một hàng.
     */
    <YStack
      gap={12}
      p={space.md}
      br={radius.card}
      bw={1}
      bc={market.accent}
      ov="hidden"
    >
      <LinearGradient
        colors={[colors.primarySubtle, colors.surface]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        <Pressable
          onPress={() => navigateOnce(ROUTES.content.about())}
          accessibilityRole="link"
          hitSlop={space.sm}
        >
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.primary} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('howItWorks')}
            </Text>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.primary} />
          </XStack>
        </Pressable>
      </XStack>
      {lines.map((line) => (
        <XStack key={line} ai="center" gap={space.sm}>
          <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.success} />
          <Text f={1} col={colors.text} fos={fontSize.body}>
            {line}
          </Text>
        </XStack>
      ))}
    </YStack>
  );
}
