import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, transmissionFamily } from '@xeprime/types';
import { applyDiscountPercent, isNewListing } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DetailArrow } from '@/components/ui/DetailArrow';
import { RemoteImage } from '@/components/ui/RemoteImage';
import type { IconName } from '@/components/ui/Chip';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
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
import { useSearchFilters } from '../search-context';
import type { PublicListing } from '../api';
import { HomeCardAvatar } from './home/HomeCardAvatar';

/** Ảnh 16:10 — đủ cao để nhận ra chiếc xe, đủ thấp để thẻ sau lộ ra ở cuối màn. */
const PHOTO_RATIO = 16 / 10;

/**
 * Cỡ avatar chủ xe trên thẻ — MỘT con số cho cả hai tuyến.
 *
 * `Avatar` vẽ vòng nhấn vào bên trong đường kính này, nên thẻ của gian hàng và thẻ của chủ xe cá
 * nhân có hàng chân cao bằng nhau và ảnh thẳng cột khi cuộn.
 */
/** Avatar 32px + dấu xanh trong đĩa 12px — `.shopAvatar` / `.shopMark` web. */
const SHOP_AVATAR = 32;

/*
 * Nhãn "Không cần xác nhận" — cùng token gradient với web (`--xp-gradient-instant-badge`, 90deg).
 * Nền là màu sáng cố định ở cả hai giao diện nên chữ lấy màu chữ của bảng SÁNG.
 */
const INSTANT_BADGE = gradient('gradient-instant-badge');
// Huy hiệu % giảm trên ảnh = `DiscountTag variant="badge"` của web: gold nhạt, chữ "N% off".
const DISCOUNT_BADGE = gradient('gradient-gold-soft');
const INSTANT_TEXT = PALETTES.light.colors.text;

/*
 * Bố cục CỐ ĐỊNH: mỗi hàng giữ chỗ dù xe thiếu dữ liệu, giá luôn ở đáy — thẻ trong lưới/băng
 * chuyền cao bằng nhau như web (`.footer { margin-top: auto }` + thẻ `height: 100%`).
 */
const ROW_LOCATION = 20;
const ROW_AMENITY = 22;
const ROW_SPECS = 40;
const ROW_FOOTER = 48;

const styles = StyleSheet.create({
  // `.badge` của web: bo `border-radius-chip`, đệm xs × 6.
  badge: {
    borderRadius: toPx(XP_TOKENS['border-radius-chip']),
    paddingHorizontal: toPx(XP_TOKENS['space-6']),
    paddingVertical: space.xs,
  },
});

interface VehicleCardProps {
  listing: PublicListing;
  /** Vắng mặt = thẻ chỉ hiển thị, không bọc `Pressable` và không đọc ra là nút bấm được. */
  onPress?: (listing: PublicListing, serviceType: string | undefined) => void;
}

/**
 * Thẻ xe trên marketplace.
 *
 * Không có nút thuê ở đây, giống web: thẻ chỉ mang dữ liệu tóm tắt, còn quyết định thuê cần
 * giá theo ngày, chính sách cọc, điều kiện giao nhận và đánh giá — tức là trang chi tiết.
 */
function VehicleCardImpl({ listing, onPress }: VehicleCardProps) {
  const colors = useColors();
  const t = useTranslations('Listings.card');
  const tCommon = useTranslations('Common.components');
  const navigateOnce = useNavigateOnce();
  const fmt = useAppFormat();
  const filters = useSearchFilters();

  /*
   * Thẻ xe phải phân biệt được HAI TUYẾN (ADR 0028): gian hàng thuê bao đã qua duyệt hồ sơ VÀ
   * đang trả tiền — hai điều khách nhìn vào một cái tên không thể tự biết. Là BOOLEAN chứ
   * không phải storefrontKind: thẻ xe không vẽ mặt tiền, nó chỉ cần biết có dấu hay không.
   */
  const isShopTrack = listing.shopVerified ?? false;

  /*
   * Giá ở dạng GỌN, hai chữ số lẻ. Trên thẻ, tên gian hàng và giá chia nhau một hàng hẹp; giá
   * đầy đủ đẩy tên bị cắt trước. Hai chữ số lẻ là bắt buộc vì đây là con số khách so giữa hai
   * chiếc xe — "1tr" cho 1.050.000 là sai 50.000đ ngay chỗ quyết định.
   */
  const compactPrice = (value: string) => fmt.moneyCompact(value, { price: true });
  // Thẻ xe lưu KEY nhiên liệu — nhãn tra từ danh mục chung với web, không dịch tại chỗ.
  const { fuelTypeLabel } = useCatalogLabels();

  /*
   * MỘT `activeService` cho cả thẻ — giá, đơn vị và ghi chú cùng đọc từ đây, không bao giờ một
   * chỗ nói dịch vụ này còn chỗ khác nói dịch vụ kia:
   *   1. dịch vụ đang lọc (nếu xe phục vụ được);
   *   2. không lọc → ưu tiên tự lái nếu xe hỗ trợ;
   *   3. xe không có tự lái → dịch vụ đầu tiên xe đăng.
   */
  const serviceTypes: string[] = listing.serviceTypes ?? [];
  const serviceContext =
    filters.serviceType && serviceTypes.includes(filters.serviceType) ? filters.serviceType : null;
  const activeService =
    serviceContext ??
    (serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE) ? SERVICE_TYPE.SELF_DRIVE : serviceTypes[0]);

  const rating = Number(listing.ratingAvg);
  // `?? 0`: cột DB cho phép NULL ở xe chưa từng được đồng bộ lại rating (dữ liệu cũ) dù DTO
  // khai `ratingCount` không optional — hợp đồng kiểu và thực tế lệch nhau.
  // Cùng luật "Xe mới" với web (`isNewListing`) — thẻ và trang chi tiết không bao giờ lệch nhau.
  const hasRating = !isNewListing({
    ratingCount: listing.ratingCount ?? 0,
    ratingAvg: listing.ratingAvg,
  });
  // Preview cùng công thức với PricingService; báo giá server vẫn là nguồn chốt.
  const discount = listing.discountPercent ?? 0;

  /*
   * Giá theo `activeService`:
   *   - dài hạn → giá tháng; chưa niêm yết → "Liên hệ báo giá" (KHÔNG lấy giá tự lái trưng thay);
   *   - có tài xế → giá/ngày đã gồm tài xế; chưa niêm yết → "Liên hệ báo giá";
   *   - tự lái → giá ngày sau khuyến mãi.
   */
  const monthlyPrice =
    activeService === SERVICE_TYPE.LONG_TERM && listing.monthlyPrice ? listing.monthlyPrice : null;
  const driverPrice =
    activeService === SERVICE_TYPE.WITH_DRIVER && listing.withDriverDailyPrice
      ? listing.withDriverDailyPrice
      : null;
  const selfDrive = activeService === SERVICE_TYPE.SELF_DRIVE;
  const displayPrice = selfDrive
    ? discount > 0
      ? applyDiscountPercent(listing.weekdayPrice, discount)
      : listing.weekdayPrice
    : (monthlyPrice ?? driverPrice);
  const priceUnit = monthlyPrice ? t('perMonthUnit') : t('perDayUnit');
  const fuel = fuelTypeLabel(listing.fuelType);

  /*
   * "Đặt ngay" theo ĐÚNG dịch vụ đang xem — một xe có thể tự nhận chuyến tự lái mà vẫn chờ duyệt
   * chuyến có tài xế. Cùng luật với web.
   */
  const instantBook = Boolean(
    activeService && (listing.instantBookServiceTypes ?? []).some((type) => type === activeService),
  );
  // Ảnh bìa đã hiện — chip đếm phần CÒN LẠI, như web.
  const extraPhotos = Math.max(0, (listing.imageCount ?? 0) - 1);
  const location = listing.shopProvince
    ? listing.wardName
      ? t('locationLine', { ward: listing.wardName, province: listing.shopProvince })
      : listing.shopProvince
    : null;
  const amenities = [
    listing.deliveryEnabled ? t('delivery') : null,
    listing.noCollateral ? t('noCollateral') : null,
    // Thẻ chỉ có chỗ cho nhãn ngắn — câu "ai xuất, cho khoản nào" ở trang xe (ADR 0059).
    listing.vatInvoiceSupported ? t('vatInvoice') : null,
  ].filter((label): label is string => label !== null);
  const specs = [
    listing.seatCount
      ? { key: 'seats', icon: 'people-outline', label: t('seats', { count: listing.seatCount }) }
      : null,
    listing.transmission
      ? {
          key: 'transmission',
          icon: 'cog-outline',
          label: t(`transmissionFamily.${transmissionFamily(listing.transmission)}`),
        }
      : null,
    fuel ? { key: 'fuel', icon: 'water-outline', label: fuel } : null,
  ].filter((spec): spec is { key: string; icon: IconName; label: string } => spec !== null);

  const open = onPress ? () => onPress(listing, activeService) : undefined;

  return (
    <Card
      padded={false}
      seamless
      {...(open
        ? { onPress: open, accessibilityLabel: t('viewDetail', { name: listing.name }) }
        : {})}
    >
      <YStack aspectRatio={PHOTO_RATIO}>
        <RemoteImage
          uri={listing.mainImageUrl}
          recyclingKey={listing.id}
          accessibilityLabel={listing.name}
          fallback={<Ionicons name="car-sport-outline" size={40} color={colors.border} />}
        />

        {/*
          Mũi tên chi tiết GIỮ NGUYÊN chỗ: đè lên ảnh, góc trên-phải. Nút "Lưu xe" (trái tim) của
          bản vẽ CỐ Ý chưa có — web cũng chưa có: tính năng xe yêu thích chưa mở.
        */}
        {open ? (
          <DetailArrow
            label={t('viewDetail', { name: listing.name })}
            onPress={open}
            inset={space.sm}
          />
        ) : null}

        <XStack
          pos="absolute"
          top={space.sm}
          left={space.sm}
          right={space.sm + iconSize.md + space.md}
          fd="column"
          ai="flex-start"
          gap={5}
        >
          {/* % giảm là của giá TỰ LÁI — ngữ cảnh khác không mang nó (ADR 0011). */}
          {selfDrive && discount > 0 ? (
            <LinearGradient
              colors={DISCOUNT_BADGE.colors}
              locations={DISCOUNT_BADGE.locations}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badge}
            >
              <Text
                col={INSTANT_TEXT}
                fos={fontSize.label}
                fow={fontWeight.medium}
                accessibilityLabel={tCommon('discount', { percent: discount })}
              >
                {tCommon('discountBadge', { percent: discount })}
              </Text>
            </LinearGradient>
          ) : null}
          {instantBook ? (
            <LinearGradient
              colors={INSTANT_BADGE.colors}
              locations={INSTANT_BADGE.locations}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badge}
            >
              <Text col={INSTANT_TEXT} fos={fontSize.label} fow={fontWeight.medium}>
                {t('instantBook')}
              </Text>
            </LinearGradient>
          ) : null}
        </XStack>

        {extraPhotos > 0 ? (
          <XStack
            pos="absolute"
            right={space.sm}
            bottom={space.sm}
            ai="center"
            gap={2}
            px={space.xs}
            py={2}
            br={radius.sm}
            bg={market.inverse}
            accessible
            accessibilityLabel={t('photoCountAria', { count: listing.imageCount ?? 0 })}
          >
            <Ionicons name="images-outline" size={iconSize.xs} color={market.onDark} />
            <Text col={market.onDark} fos={fontSize.label}>
              {t('photoCount', { count: extraPhotos })}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      <YStack p={space.md} gap={space.sm}>
        <YStack gap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            <Text
              flexShrink={1}
              col={colors.text}
              fos={fontSize.bodyLg}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {listing.name}
            </Text>
            {/* Chưa có đánh giá nào = xe mới lên chợ — cùng luật với web. */}
            {hasRating ? null : (
              <XStack bg={colors.successSurface} br={radius.pill} px={space.sm} py={1}>
                <Text col={colors.success} fos={fontSize.label} fow={fontWeight.medium}>
                  {t('newVehicle')}
                </Text>
              </XStack>
            )}
          </XStack>
          <XStack h={ROW_LOCATION} ai="center" gap={space.xs}>
            {location ? (
              <>
                <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {location}
                </Text>
              </>
            ) : null}
          </XStack>
          {/* Một hàng nhãn duy nhất, không xuống dòng — giữ chiều cao thẻ cố định. */}
          <XStack h={ROW_AMENITY} gap={space.xs} ov="hidden">
            {amenities.map((label) => (
              <XStack
                key={label}
                flexShrink={0}
                bg={colors.surfaceMuted}
                br={radius.sm}
                px={space.sm}
                py={2}
              >
                <Text
                  col={colors.textMuted}
                  fos={fontSize.label}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </XStack>
            ))}
          </XStack>
        </YStack>

        <YStack h={1} bg={colors.borderSubtle} />
        <XStack h={ROW_SPECS} ai="center" jc="space-around" accessibilityLabel={t('specsLabel')}>
          {specs.map((spec) => (
            <YStack key={spec.key} ai="center" gap={2}>
              <Ionicons name={spec.icon} size={iconSize.sm} color={colors.textMuted} />
              <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {spec.label}
              </Text>
            </YStack>
          ))}
        </XStack>

        <YStack h={1} bg={colors.borderSubtle} />

        {/*
          Hàng gian hàng là một đích chạm RIÊNG, lồng trong thẻ — đúng như web lồng một `<Link>`
          sang `/shops/[slug]` ở chính chỗ này. `py` nâng chiều cao vùng chạm: một đích chạm nằm
          lọt trong đích chạm khác thì thiếu vài dp là bấm trượt sang trang xe.
        */}
        <Pressable
          onPress={() => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug))}
          accessibilityRole="button"
          /*
            `accessibilityLabel` THAY THẾ mọi chữ bên trong khi trình đọc màn hình đọc nó — nên
            nhãn xác minh phải ghép vào đây, ở tầng BẢN DỊCH.
          */
          accessibilityLabel={
            isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
          }
        >
          <XStack ai="center" gap={space.sm} py={space.xs}>
            <HomeCardAvatar
              name={listing.shopName}
              url={listing.shopLogoUrl}
              size={SHOP_AVATAR}
              verified={isShopTrack}
              markDisc={12}
              markIcon={9}
            />
            <YStack f={1} gap={0}>
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {t(isShopTrack ? 'shop' : 'owner')}
              </Text>
              {/* Web: tên gian hàng primary-hover, chủ xe cá nhân text-secondary; dấu xác thực chỉ nằm trên avatar. */}
              <Text
                col={isShopTrack ? colors.primaryHover : colors.textMuted}
                fos={fontSize.body}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {listing.shopName}
              </Text>
            </YStack>
          </XStack>
        </Pressable>

        <XStack minHeight={ROW_FOOTER} ai="center" jc="space-between" gap={space.sm}>
          {hasRating ? (
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="star" size={iconSize.sm} color={colors.primary} />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t.rich('ratingValue', {
                  rating: fmt.rating(rating),
                  count: listing.ratingCount ?? 0,
                  muted: (chunks) => <Text col={colors.placeholder}>{chunks}</Text>,
                })}
              </Text>
            </XStack>
          ) : (
            <YStack />
          )}

          <YStack ai="flex-end">
            {displayPrice ? (
              <XStack ai="baseline" gap={space.xs}>
                {selfDrive && discount > 0 && listing.weekdayPrice ? (
                  <Text
                    col={colors.textDisabled}
                    fos={fontSize.bodySm}
                    textDecorationLine="line-through"
                  >
                    {compactPrice(listing.weekdayPrice)}
                  </Text>
                ) : null}
                <Text col={colors.primary} fos={fontSize.h3} fow={fontWeight.semibold}>
                  {compactPrice(displayPrice)}
                </Text>
                <Text col={colors.placeholder} fos={fontSize.bodySm}>
                  {priceUnit}
                </Text>
              </XStack>
            ) : (
              // Dịch vụ đang active chưa niêm yết giá — KHÔNG trưng giá của dịch vụ khác thay.
              <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {t('contactForQuote')}
              </Text>
            )}
            {driverPrice ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('includesDriver')}
              </Text>
            ) : null}
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * Bọc `memo`: đây là hàng trong danh sách kết quả, và màn đó dựng lại vì đủ thứ không liên quan
 * tới một chiếc xe cụ thể (đo chiều cao khối lọc, tải thêm trang, đổi thứ tự sắp xếp).
 *
 * Chỉ có tác dụng khi nơi gọi truyền `onPress` ỔN ĐỊNH — `SearchResultsScreen` dùng
 * `useCallback` đúng vì lý do đó.
 */
export const VehicleCard = memo(VehicleCardImpl);
