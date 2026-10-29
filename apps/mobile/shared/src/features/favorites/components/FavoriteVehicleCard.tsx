import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { isNewListing } from '@xeprime/domain';
import { transmissionFamily, type FavoriteVehicle } from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { HomeCardAvatar } from '@/features/marketplace/components/home/HomeCardAvatar';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import {
  PALETTES,
  fontSize,
  fontWeight,
  gradient,
  iconSize,
  market,
  radius,
  space,
} from '@/theme/tokens';
import { useFavoriteToggle } from '../hooks/use-favorite';
import { FavoriteButton } from './FavoriteButton';

/** Ảnh 16:9 — `.media { aspect-ratio: 16 / 9 }` của web khi thẻ hẹp (< 640px, tức mọi điện thoại). */
const PHOTO_RATIO = 16 / 9;
/** Avatar chủ xe 36 + dấu xác thực trong đĩa 12 — `.shopAvatar` / `.shopMark` web. */
const SHOP_AVATAR = 36;
/** Cao nút "Bỏ thích" / "Xem chi tiết" — `min-height: 36px` của web. */
const ACTION_HEIGHT = 36;

/*
 * Nhãn "Không cần xác nhận" — cùng token gradient với web (`--xp-gradient-instant-badge`). Nền là
 * màu sáng cố định ở cả hai giao diện nên chữ lấy màu chữ của bảng SÁNG (như thẻ chợ).
 */
const INSTANT_BADGE = gradient('gradient-instant-badge');
const INSTANT_TEXT = PALETTES.light.colors.text;

const styles = StyleSheet.create({
  badge: {
    borderRadius: toPx(XP_TOKENS['border-radius-chip']),
    paddingHorizontal: toPx(XP_TOKENS['space-6']),
    paddingVertical: space.xs,
  },
});

/**
 * MỘT thẻ trong màn Xe yêu thích — bản native của web `FavoriteVehicleCard` ở bố cục HẸP (thẻ
 * `@container` < 640px): ảnh trên (huy hiệu "Không cần xác nhận", trái tim, +N ảnh), dưới là ba
 * phần ngăn bằng vạch mảnh — tên · "Đã lưu …" · vị trí · tag dịch vụ + tiện ích | thông số | chủ xe
 * · đánh giá · hai nút chia đều.
 *
 * KHÔNG hiện giá (chủ sản phẩm chốt 21/10/2026: giá xem ở trang chi tiết). Bấm một tag dịch vụ ⇒
 * mở chi tiết với ĐÚNG dịch vụ đó; "Xem chi tiết" và ảnh ⇒ dịch vụ mặc định. Bỏ thích lạc quan: thẻ
 * rời danh sách ngay, lỗi thì quay lại đúng vị trí (`favorite-cache.ts`).
 */
function FavoriteVehicleCardImpl({ vehicle }: { vehicle: FavoriteVehicle }) {
  const colors = useColors();
  const t = useTranslations('Favorites.card');
  const tCard = useTranslations('Listings.card');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { fuelTypeLabel } = useCatalogLabels();
  const { apply } = useFavoriteToggle(vehicle.id, { initialFavorite: true });

  const isShopTrack = vehicle.shopVerified ?? false;
  const hasRating = !isNewListing(vehicle);
  const instantBook = (vehicle.instantBookServiceTypes ?? []).length > 0;
  const extraPhotos = Math.max(0, (vehicle.imageCount ?? 0) - 1);
  const fuel = fuelTypeLabel(vehicle.fuelType);
  const location = vehicle.shopProvince
    ? vehicle.wardName
      ? tCard('locationLine', { ward: vehicle.wardName, province: vehicle.shopProvince })
      : vehicle.shopProvince
    : null;

  const amenities = [
    vehicle.deliveryEnabled ? tCard('delivery') : null,
    vehicle.noCollateral ? tCard('noCollateral') : null,
    vehicle.vatInvoiceSupported ? tCard('vatInvoice') : null,
  ].filter((label): label is string => label !== null);

  // Cùng bộ icon với thẻ chợ native (`VehicleCard`) — bản thay cho các SVG `/home/card-*.svg` web.
  const specs = [
    vehicle.seatCount
      ? { key: 'seats', icon: 'people-outline', label: tCard('seats', { count: vehicle.seatCount }) }
      : null,
    vehicle.transmission
      ? {
          key: 'transmission',
          icon: 'cog-outline',
          label: tCard(`transmissionFamily.${transmissionFamily(vehicle.transmission)}`),
        }
      : null,
    fuel ? { key: 'fuel', icon: 'water-outline', label: fuel } : null,
  ].filter((spec): spec is { key: string; icon: IconName; label: string } => spec !== null);

  const openDetail = (service?: string) =>
    navigateOnce(ROUTES.explore.listingDetail(vehicle.id, service));

  return (
    /* Vùng thẻ — web `.card`: viền `border-subtle` 1px, bo `radius-card`, nền `bg-container`, bóng `elevation-sm`. */
    <Card padded={false} borderColor={colors.borderSubtle}>
      <YStack aspectRatio={PHOTO_RATIO} bg={colors.surfaceMuted}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => openDetail()}
          accessibilityRole="link"
          accessibilityLabel={t('viewDetailAria', { name: vehicle.name })}
        >
          <RemoteImage
            uri={vehicle.mainImageUrl}
            recyclingKey={vehicle.id}
            accessibilityLabel={vehicle.name}
            fallback={<Ionicons name="car-outline" size={48} color={colors.textPlaceholder} />}
          />
        </Pressable>

        {instantBook ? (
          <XStack pos="absolute" top={space.sm} left={space.sm} pointerEvents="none">
            <LinearGradient
              colors={INSTANT_BADGE.colors}
              locations={INSTANT_BADGE.locations}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badge}
            >
              <Text col={INSTANT_TEXT} fos={fontSize.label} fow={fontWeight.medium}>
                {tCard('instantBook')}
              </Text>
            </LinearGradient>
          </XStack>
        ) : null}

        <XStack pos="absolute" top={toPx(XP_TOKENS['space-12'])} right={toPx(XP_TOKENS['space-12'])}>
          <FavoriteButton vehicleId={vehicle.id} vehicleName={vehicle.name} variant="card" />
        </XStack>

        {extraPhotos > 0 ? (
          <XStack
            pos="absolute"
            right={space.sm}
            bottom={toPx(XP_TOKENS['space-6'])}
            ai="center"
            gap={2}
            px={space.xs}
            py={2}
            br={radius.sm}
            bg={market.inverse}
            pointerEvents="none"
            accessible
            accessibilityLabel={tCard('photoCountAria', { count: vehicle.imageCount ?? 0 })}
          >
            <Ionicons name="images-outline" size={iconSize.xs} color={market.onDark} />
            <Text col={market.onDark} fos={fontSize.label}>
              {tCard('photoCount', { count: extraPhotos })}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      <YStack p={space.md} gap={space.sm}>
        {/* Phần 1 — tên · "Đã lưu" · vị trí · tag dịch vụ + tiện ích. */}
        <YStack gap={space.xs} pb={space.sm} borderBottomWidth={1} borderBottomColor={colors.background}>
          <XStack flexWrap="wrap" ai="center" columnGap={space.sm} rowGap={space.xs}>
            <Pressable
              onPress={() => openDetail()}
              accessibilityRole="link"
              style={{ flexShrink: 1 }}
            >
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold}>
                {vehicle.name}
              </Text>
            </Pressable>
            {!hasRating ? (
              <XStack bg={colors.successSurface} br={radius.card} px={space.sm} py={2}>
                <Text col={colors.success} fos={fontSize.label} fow={fontWeight.medium}>
                  {tCard('newVehicle')}
                </Text>
              </XStack>
            ) : null}
            {/* "Đã lưu …" — web `.savedAt` nằm CÙNG `.nameRow` với tên + nhãn mới, xuống dòng khi hẹp. */}
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="time-outline" size={iconSize.xs} color={colors.placeholder} />
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('savedAt', { dateTime: fmt.dateTime(vehicle.favoritedAt) })}
              </Text>
            </XStack>
          </XStack>

          {location ? (
            <XStack ai="center" gap={space.sm}>
              <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
              <Text f={1} col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
                {location}
              </Text>
            </XStack>
          ) : null}

          {vehicle.serviceTypes.length > 0 || amenities.length > 0 ? (
            <XStack flexWrap="wrap" gap={space.xs} mt={2}>
              {/* Hai nhóm có nhãn riêng cho trình đọc màn hình — hai `<ul aria-label>` của web. */}
              {vehicle.serviceTypes.length > 0 ? (
              <XStack
                flexWrap="wrap"
                gap={space.xs}
                accessibilityRole="list"
                accessibilityLabel={t('servicesLabel')}
              >
              {vehicle.serviceTypes.map((service) => {
                const label = dl('serviceType', service);
                return (
                  <Pressable
                    key={service}
                    onPress={() => openDetail(service)}
                    accessibilityRole="link"
                    accessibilityLabel={t('serviceLinkAria', { name: vehicle.name, service: label })}
                  >
                    <XStack bg={colors.primarySubtle} br={radius.card} px={space.sm} py={2}>
                      <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.medium}>
                        {label}
                      </Text>
                    </XStack>
                  </Pressable>
                );
              })}
              </XStack>
              ) : null}
              {amenities.length > 0 ? (
              <XStack
                flexWrap="wrap"
                gap={space.xs}
                accessibilityRole="list"
                accessibilityLabel={t('highlightsLabel')}
              >
              {amenities.map((label) => (
                <XStack key={label} bg={colors.surfaceMuted} br={radius.card} px={space.sm} py={2}>
                  <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
                    {label}
                  </Text>
                </XStack>
              ))}
              </XStack>
              ) : null}
            </XStack>
          ) : null}
        </YStack>

        {/* Phần 2 — thông số: icon + chữ trên một hàng, vạch dưới như thẻ trang chủ. */}
        {specs.length > 0 ? (
          <XStack
            flexWrap="wrap"
            ai="center"
            columnGap={space.lg}
            rowGap={space.xs}
            pb={space.sm}
            borderBottomWidth={1}
            borderBottomColor={colors.background}
            accessibilityLabel={tCard('specsLabel')}
          >
            {specs.map((spec) => (
              <XStack key={spec.key} ai="center" gap={space.sm}>
                {/* Icon thông số — web SVG `card-seats/transmission/fuel` tô `text-placeholder`. */}
                <Ionicons name={spec.icon} size={iconSize.sm} color={colors.textPlaceholder} />
                <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
                  {spec.label}
                </Text>
              </XStack>
            ))}
          </XStack>
        ) : null}

        {/* Phần 3 — chủ xe / gian hàng · đánh giá · hai nút. */}
        <YStack gap={space.sm}>
          <XStack flexWrap="wrap" ai="center" columnGap={space.lg} rowGap={space.sm}>
            <Pressable
              onPress={() => navigateOnce(ROUTES.explore.shopDetail(vehicle.shopSlug))}
              accessibilityRole="link"
              accessibilityLabel={
                isShopTrack ? tCard('shopVerifiedAria', { name: vehicle.shopName }) : vehicle.shopName
              }
              style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200 }}
            >
              <XStack ai="center" gap={toPx(XP_TOKENS['space-12'])}>
                <HomeCardAvatar
                  name={vehicle.shopName}
                  url={vehicle.shopLogoUrl}
                  size={SHOP_AVATAR}
                  verified={isShopTrack}
                  markDisc={12}
                  markIcon={10}
                />
                <YStack f={1} minWidth={0}>
                  <Text col={colors.placeholder} fos={fontSize.bodySm}>
                    {tCard(isShopTrack ? 'shop' : 'owner')}
                  </Text>
                  <Text
                    col={isShopTrack ? colors.primaryHover : colors.textMuted}
                    fos={fontSize.body}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {vehicle.shopName}
                  </Text>
                </YStack>
              </XStack>
            </Pressable>

            {hasRating ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="star" size={iconSize.sm} color={market.star} />
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {tCard.rich('ratingValue', {
                    rating: fmt.rating(Number(vehicle.ratingAvg)),
                    count: vehicle.ratingCount,
                    muted: (chunks) => <Text col={colors.textPlaceholder}>{chunks}</Text>,
                  })}
                </Text>
                {vehicle.completedTripCount > 0 ? (
                  <Text col={colors.textPlaceholder} fos={fontSize.body} marginLeft={space.xs}>
                    {`• ${tCard('completedTrips', { count: vehicle.completedTripCount })}`}
                  </Text>
                ) : null}
              </XStack>
            ) : null}
          </XStack>

          <XStack gap={space.sm}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => apply(false)}
              accessibilityRole="button"
              accessibilityLabel={t('removeAria', { name: vehicle.name })}
            >
              <XStack
                h={ACTION_HEIGHT}
                ai="center"
                jc="center"
                gap={space.xs}
                px={space.md}
                br={radius.control}
                bw={1}
                bc={colors.border}
                bg={colors.surface}
              >
                <Ionicons name="heart" size={iconSize.sm} color={colors.danger} />
                <Text col={colors.text} fos={fontSize.body}>
                  {t('remove')}
                </Text>
              </XStack>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => openDetail()} accessibilityRole="link">
              <XStack
                h={ACTION_HEIGHT}
                ai="center"
                jc="center"
                gap={space.xs}
                px={toPx(XP_TOKENS['space-20'])}
                br={radius.control}
                bg={colors.primary}
              >
                <Ionicons name="eye-outline" size={iconSize.sm} color={colors.onPrimary} />
                <Text col={colors.onPrimary} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('viewDetail')}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </YStack>
      </YStack>
    </Card>
  );
}

/** Bọc `memo`: hàng của danh sách — màn dựng lại khi tải thêm trang, đổi tab, đếm số. */
export const FavoriteVehicleCard = memo(FavoriteVehicleCardImpl);

/** Khung chờ cùng dáng thẻ (ảnh · ba phần chi tiết) — dữ liệu về không làm nhảy bố cục. */
export function FavoriteVehicleCardSkeleton() {
  return (
    <Card padded={false} seamless>
      <Skeleton aspectRatio={PHOTO_RATIO} />
      <YStack p={space.md} gap={space.md}>
        <SkeletonText lines={3} />
        <XStack ai="center" gap={space.sm}>
          <Skeleton width={SHOP_AVATAR} height={SHOP_AVATAR} round />
          <YStack f={1}>
            <SkeletonText lines={1} />
          </YStack>
        </XStack>
        <Skeleton height={ACTION_HEIGHT} />
      </YStack>
    </Card>
  );
}
