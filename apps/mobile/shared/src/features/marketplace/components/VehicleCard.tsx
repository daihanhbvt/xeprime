import { CardSpecIcon } from '@/components/icons/CardSpecIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { SvgXml } from 'react-native-svg';
import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, transmissionFamily } from '@xeprime/types';
import { applyDiscountPercent, isNewListing } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { RemoteImage } from '@/components/ui/RemoteImage';
import type { IconName } from '@/components/ui/Chip';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
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
import type { HostMetrics as HostMetricsShape } from '@xeprime/types';
import { HostMetrics } from './HostMetrics';
import { NewVehicleBadge } from './NewVehicleBadge';
import { PhotoAmenityPills, listingAmenityItems } from './PhotoAmenityPills';
import { HighlightZoom } from '@/components/ui/HighlightZoom';
import { CARD_ICON_XML } from './cardIcons';
import { HomeCardAvatar } from './home/HomeCardAvatar';
import { ShopLocationIcon } from './shop-icons';
import { layout } from '@/theme/layout';

/**
 * Ảnh 16:9 — đủ cao để nhận ra chiếc xe, đủ thấp để thẻ sau lộ ra ở cuối màn (hạ từ 16:10 cho thẻ
 * thấp bớt — người dùng chốt 27/10/2026).
 */
const PHOTO_RATIO = 16 / 9;

/**
 * Cỡ avatar chủ xe trên thẻ — MỘT con số cho cả hai tuyến.
 *
 * `Avatar` vẽ vòng nhấn vào bên trong đường kính này, nên thẻ của gian hàng và thẻ của chủ xe cá
 * nhân có hàng chân cao bằng nhau và ảnh thẳng cột khi cuộn.
 */
/** Avatar 32px + dấu xanh trong đĩa 12px — `.shopAvatar` / `.shopMark` web. */
const SHOP_AVATAR = 32;

// Huy hiệu % giảm trên ảnh = `DiscountTag variant="badge"` của web: gold nhạt, chữ "N% off".
const DISCOUNT_BADGE = gradient('gradient-gold-soft');
const INSTANT_TEXT = PALETTES.light.colors.text;

/*
 * Bố cục CỐ ĐỊNH: mỗi hàng giữ chỗ dù xe thiếu dữ liệu, giá luôn ở đáy — thẻ trong lưới/băng
 * chuyền cao bằng nhau như web (`.footer { margin-top: auto }` + thẻ `height: 100%`).
 */
// 24 chứ không 22: Be Vietnam Pro cần ~22,4dp cho cỡ 14 (khoảng trên cho dấu tiếng Việt + phần
// dưới cho móc chữ). Dòng 22 + `numberOfLines={1}` làm iOS cắt mất móc của g/y/p (10/11/2026).
const ROW_LOCATION = 24;
/**
 * Chiều cao dòng cho chữ cỡ `body` bị kẹp MỘT dòng (`numberOfLines={1}`) trên thẻ — địa chỉ, tên
 * gian hàng, thông số. Kẹp dòng thì iOS cắt đúng theo hộp dòng, nên hộp phải đủ cho móc chữ.
 */
const CLAMPED_LINE_HEIGHT = ROW_LOCATION;
// Icon thông số của Figma "Vehicle Card": khung 16, hình vẽ đặt giữa theo kích thước gốc của file.
const SPEC_ICON_XML = {
  seats: { xml: CARD_ICON_XML.seats, w: 12, h: 11 },
  transmission: { xml: CARD_ICON_XML.transmission, w: 13, h: 13 },
  fuel: { xml: CARD_ICON_XML.fuel, w: 16, h: 16 },
} as const;
const ROW_SPECS = 34;
const ROW_FOOTER = 42;
/** Ảnh thẻ ngang ở bề ngang hẹp (web `.listMedia` ≤860px `height: 180px`, trừ đệm 10 hai đầu). */
const LIST_PHOTO_HEIGHT = 160;
/** Ảnh của thẻ ngang chế độ "Danh sách" — 152 × 114, chữ nhật ngang 4:3 như web ≤640px `.listPhoto`. */
const ROW_PHOTO = { width: 152, height: 114 };

/** Trái tim trên ảnh: cách mép ảnh 6, đĩa 32 — `.favoriteBtn` của web (Figma `22185:87155`). */
const HEART_INSET = toPx(XP_TOKENS['space-6']);
/** Figma "Vehicle Card" `22185:87092`: đệm 8 quanh ảnh, ảnh bo 12. */
const CARD_INSET = space.sm;
const PHOTO_RADIUS = toPx(XP_TOKENS['space-12']);
const HEART_DISC = 32;

const footerStyles = StyleSheet.create({
  shop: { flex: 1, minWidth: 0 },
});

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
  /**
   * Ba chỉ số của CHỦ XE trên thẻ — CHỈ trang gian hàng có ít xe truyền vào (web `variant="list"`
   * + `hostMetrics`, #222): một chủ, một phép gộp có sẵn. Thẻ ở trang KẾT QUẢ không mang chỉ số uy
   * tín (ADR 0045 điều 3 — 48 thẻ là 48 phép gộp).
   */
  hostMetrics?: HostMetricsShape | null;
  /**
   * `list` = thẻ NGANG của trang gian hàng ít xe (web `variant="list"`, Figma `20058:73312`), vẽ theo
   * bố cục web ở bề ngang ≤860px: ảnh trên, tên + huy hiệu, điểm · giá · tim, nơi có xe, ô thông
   * số có icon, hàng đáy chủ xe · "Xem chi tiết", chỉ số chủ xe xuống dòng riêng. Mặc định `grid`.
   */
  variant?: 'grid' | 'list' | 'row';
  /**
   * Dịch vụ đang lọc của bề mặt chứa thẻ khi bề mặt đó KHÔNG nằm trong ngữ cảnh tìm kiếm — trang
   * gian hàng lọc bằng state cục bộ, còn web thì đọc URL của chính trang đó (`useMarketplaceFilters`).
   * Có giá trị thì thắng `useSearchFilters()`: bật chip "Có tài xế" là thẻ hiện giá tài xế.
   */
  serviceType?: string;
  /**
   * Thẻ đang ở GIỮA băng chuyền "Xe tiêu biểu": hiện sẵn trạng thái hover của web (viền + nền
   * vàng, tên xe vàng, số tiền primary-hover) — trên cảm ứng không có chuột để rê.
   */
  highlighted?: boolean;
}

/**
 * Thẻ xe trên marketplace.
 *
 * Không có nút thuê ở đây, giống web: thẻ chỉ mang dữ liệu tóm tắt, còn quyết định thuê cần
 * giá theo ngày, chính sách cọc, điều kiện giao nhận và đánh giá — tức là trang chi tiết.
 */
function VehicleCardImpl({
  listing,
  onPress,
  hostMetrics,
  variant = 'grid',
  serviceType: serviceFilter,
  highlighted = false,
}: VehicleCardProps) {
  const colors = useColors();
  // Giao diện tối: tên gian hàng vàng chuẩn `primary` (người dùng chốt 04/11/2026).
  const dark = useAppScheme().scheme === 'dark';
  const shopNameColor = dark ? colors.primary : colors.primaryHover;
  // Figma dark: thẻ có viền `#414651`; ô số ảnh đảo màu (nền trắng, chữ đen).
  const darkBorder = dark ? { borderColor: colors.border } : {};
  const t = useTranslations('Listings.card');
  const tResults = useTranslations('Marketplace.results');
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
  const { fuelTypeLabel, bodyTypeLabel } = useCatalogLabels();

  /*
   * MỘT `activeService` cho cả thẻ — giá, đơn vị và ghi chú cùng đọc từ đây, không bao giờ một
   * chỗ nói dịch vụ này còn chỗ khác nói dịch vụ kia:
   *   1. dịch vụ đang lọc (nếu xe phục vụ được);
   *   2. không lọc → ưu tiên tự lái nếu xe hỗ trợ;
   *   3. xe không có tự lái → dịch vụ đầu tiên xe đăng.
   */
  const serviceTypes: string[] = listing.serviceTypes ?? [];
  const filteredService = serviceFilter ?? filters.serviceType;
  const serviceContext =
    filteredService && serviceTypes.includes(filteredService) ? filteredService : null;
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
   *   - có tài xế → giá/ngày đã gồm tài xế; chưa niêm yết → giá thuê xe (tự lái) kèm "chưa gồm tài
   *     xế" - đúng con số máy báo giá dùng (20/11/2026, web `VehicleCard`);
   *   - tự lái → giá ngày sau khuyến mãi.
   */
  const monthlyPrice =
    activeService === SERVICE_TYPE.LONG_TERM && listing.monthlyPrice ? listing.monthlyPrice : null;
  const withDriverContext = activeService === SERVICE_TYPE.WITH_DRIVER;
  const driverPrice = withDriverContext
    ? (listing.withDriverDailyPrice ?? listing.weekdayPrice ?? null)
    : null;
  const driverPriceNote =
    withDriverContext && driverPrice
      ? listing.withDriverDailyPrice
        ? t('withDriverIncluded')
        : t('withDriverExcluded')
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
  const location = listing.shopProvince
    ? listing.wardName
      ? t('locationLine', { ward: listing.wardName, province: listing.shopProvince })
      : listing.shopProvince
    : null;
  // Nhãn đè góc dưới-trái ảnh (Figma "List - MB" `22185:115247`) - cùng nguồn với web.
  const amenities = listingAmenityItems(listing, instantBook, (key) => t(key));
  // Kẻ hàng thông số tối: gray-100 #535862 (chưa có token tối).
  const specDivider = dark ? '#535862' : colors.borderSubtle;
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

  // Thẻ NGANG (row + list): chỉ thông số XE CÓ khai (web #222 bỏ các giá trị điền bừa khi thiếu dữ liệu).
  const bodyTypeName = listing.bodyType
    ? (bodyTypeLabel(listing.bodyType) ?? listing.bodyType)
    : null;
  // Thẻ ngang web dùng `ThunderboltOutlined` cho nhiên liệu (thẻ lưới dùng `card-fuel.svg`).
  const listSpecs = [
    ...specs.map((spec) =>
      spec.key === 'fuel' ? { ...spec, icon: 'flash-outline' as IconName } : spec,
    ),
    bodyTypeName
      ? { key: 'bodyType', icon: 'compass-outline' as IconName, label: bodyTypeName }
      : null,
  ].filter((spec): spec is { key: string; icon: IconName; label: string } => spec !== null);
  const specBoxBg = dark ? colors.surfaceElevated : colors.background;

  const open = onPress ? () => onPress(listing, activeService) : undefined;

  if (variant === 'row') {
    /*
     * Thẻ NGANG gọn của chế độ "Danh sách" ở trang kết quả (người dùng chốt 27/10/2026; web ≤640px
     * `.listCard` cùng bố cục): ảnh 128 bên trái, bên phải tên · nơi có xe · điểm + giá · chủ xe.
     * Thông số và tiện ích chỉ ở chế độ lưới — đây là kiểu xem lướt nhiều xe.
     */
    return (
      <Card
        padded={false}
        seamless
        {...darkBorder}
        pressHighlight
        {...(open
          ? { onPress: open, accessibilityLabel: t('viewDetail', { name: listing.name }) }
          : {})}
      >
        <XStack p={space.sm} gap={12} ai="center">
          <YStack w={ROW_PHOTO.width} h={ROW_PHOTO.height} br={radius.control} ov="hidden">
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              accessibilityLabel={listing.name}
              fallback={<Ionicons name="car-sport-outline" size={32} color={colors.border} />}
            />
            {/* Figma List: "+N" ảnh ở góc dưới-phải ảnh, nền gray-high, bo 6. */}
          </YStack>

          <YStack f={1} minWidth={0} gap={space.xs} jc="space-between">
            <XStack ai="flex-start" gap={space.xs}>
              <Text
                f={1}
                col={colors.text}
                fos={fontSize.bodyLg}
                fow={fontWeight.semibold}
                numberOfLines={2}
              >
                {listing.name}
              </Text>
              <FavoriteButton vehicleId={listing.id} vehicleName={listing.name} variant="list" />
            </XStack>
            {/* Ảnh thẻ ngang chỉ 128 — nhãn dài đặt dưới tên, MỘT hàng, cùng kiểu thẻ trang chủ. */}
            {/* Figma List: "% giảm" · "Không cần xác nhận" · "Xe mới" cạnh tên — thẻ hẹp nên xuống dưới tên. */}
            {(selfDrive && discount > 0) || instantBook || !hasRating ? (
              <XStack ai="center" gap={space.xs} flexWrap="wrap">
                {selfDrive && discount > 0 ? <DiscountBadge percent={discount} /> : null}
                {instantBook ? <InstantBookBadge /> : null}
                {!hasRating ? <NewVehicleBadge /> : null}
              </XStack>
            ) : null}
            {location ? (
              <XStack ai="center" gap={space.xs}>
                {/* Web `card-location.svg`. */}
                <CardSpecIcon kind="location" size={iconSize.xs} color={colors.placeholder} />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {location}
                </Text>
              </XStack>
            ) : null}
            <XStack ai="baseline" jc="space-between" gap={space.xs}>
              {/* = web thẻ ngang: luôn có ô sao — chưa có đánh giá ⇒ sao xám + "Chưa có đánh giá"; kèm lượt thuê. */}
              <XStack ai="center" gap={2} flexShrink={1}>
                <Ionicons name="star" size={12} color={hasRating ? market.star : colors.border} />
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {hasRating ? fmt.rating(rating) : null}
                  <Text col={colors.placeholder}>
                    {hasRating ? ` (${listing.ratingCount ?? 0})` : t('noRating')}
                    {listing.completedTripCount > 0
                      ? ` · ${t('rentals', { count: listing.completedTripCount })}`
                      : ''}
                  </Text>
                </Text>
              </XStack>
              {displayPrice ? (
                <XStack ai="baseline" gap={2} flexShrink={1} flexWrap="wrap" jc="flex-end">
                  {selfDrive && discount > 0 && listing.weekdayPrice ? (
                    <Text
                      col={colors.textDisabled}
                      fos={fontSize.bodySm}
                      textDecorationLine="line-through"
                    >
                      {`${compactPrice(listing.weekdayPrice)} `}
                    </Text>
                  ) : null}
                  <Text col={colors.primary} fos={fontSize.h3} lh={30} fow={fontWeight.semibold}>
                    {compactPrice(displayPrice)}
                  </Text>
                  <Text col={colors.placeholder} fos={fontSize.bodySm}>
                    {priceUnit}
                  </Text>
                  {driverPriceNote ? (
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {driverPriceNote}
                    </Text>
                  ) : null}
                </XStack>
              ) : (
                <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {t('contactForQuote')}
                </Text>
              )}
            </XStack>
          </YStack>
        </XStack>

        {/*
          Figma List "Vehicle Specifications": ô nền xám, icon + nhãn MỘT hàng, chia đều. Thân phải
          quá hẹp cho 4 ô nên hàng ô trải hết bề ngang thẻ, dưới ảnh.
        */}
        {listSpecs.length > 0 ? (
          <XStack gap={space.xs} px={space.sm} pb={space.sm} accessibilityLabel={t('specsLabel')}>
            {listSpecs.map((spec) => (
              <XStack
                key={spec.key}
                flexBasis={0}
                flexGrow={1}
                minWidth={0}
                ai="center"
                jc="center"
                gap={space.xs}
                py={6}
                br={radius.control}
                bg={specBoxBg}
              >
                <Ionicons name={spec.icon} size={14} color={colors.primaryHover} />
                <Text
                  flexShrink={1}
                  col={colors.textMuted}
                  fos={fontSize.label}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {spec.label}
                </Text>
              </XStack>
            ))}
          </XStack>
        ) : null}

        {/*
          Khối chủ xe ĐẦY ĐỦ như thẻ lưới (người dùng chốt 27/10/2026): avatar + dấu xác minh, nhãn
          "Gian hàng"/"Chủ xe", tên — một đích chạm riêng sang trang gian hàng. Figma List: "Xem chi
          tiết →" ở cuối cùng hàng.
        */}
        <Pressable
          onPress={() => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug))}
          accessibilityRole="button"
          accessibilityLabel={
            isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
          }
        >
          <XStack
            ai="center"
            gap={space.sm}
            mx={space.sm}
            py={space.sm}
            borderTopWidth={1}
            borderTopColor={colors.borderSubtle}
          >
            <HomeCardAvatar
              name={listing.shopName}
              url={listing.shopLogoUrl}
              size={SHOP_AVATAR}
              verified={isShopTrack}
              markDisc={12}
              markIcon={9}
            />
            <YStack f={1}>
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {t(isShopTrack ? 'shop' : 'owner')}
              </Text>
              <Text
                col={isShopTrack ? shopNameColor : colors.textMuted}
                fos={fontSize.body}
                lh={CLAMPED_LINE_HEIGHT}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {listing.shopName}
              </Text>
            </YStack>
            {open ? (
              <Pressable onPress={open} accessibilityRole="link" hitSlop={space.sm}>
                <XStack ai="center" gap={space.xs}>
                  <Text col={colors.primary} fos={fontSize.body} lh={22} fow={fontWeight.semibold}>
                    {tResults('viewDetail')}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.primary} />
                </XStack>
              </Pressable>
            ) : null}
          </XStack>
        </Pressable>
      </Card>
    );
  }

  if (variant === 'list') {
    const openShop = () => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug));

    return (
      <Card
        padded={false}
        seamless
        {...darkBorder}
        pressHighlight
        {...(open
          ? { onPress: open, accessibilityLabel: t('viewDetail', { name: listing.name }) }
          : {})}
      >
        {/* `.listMedia` ≤860px (Figma List): ảnh rộng hết thẻ, đệm 16 ba phía, ảnh bo 12. */}
        <YStack px={layout.padX} pt={space.md}>
          <YStack h={LIST_PHOTO_HEIGHT} br={radius.control} ov="hidden">
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              accessibilityLabel={listing.name}
              fallback={<Ionicons name="car-sport-outline" size={40} color={colors.border} />}
            />
          </YStack>
        </YStack>

        <YStack p={space.md} gap={space.sm}>
          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold}>
              {listing.name}
            </Text>
            {/* `.listTitleGroup` web: `DiscountTag variant="badge"` ngay sau tên khi đang ở giá tự lái có giảm. */}
            {selfDrive && discount > 0 ? <DiscountBadge percent={discount} /> : null}
            {/* Cùng nhãn với thẻ trang chủ (người dùng chốt 29/10/2026). */}
            {instantBook ? <InstantBookBadge /> : null}
            {!hasRating ? <NewVehicleBadge /> : null}
          </XStack>

          <XStack ai="center" gap={space.md}>
            {/* = web thẻ ngang: luôn có ô sao (xám khi chưa có đánh giá) + lượt thuê. */}
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="star" size={14} color={hasRating ? market.star : colors.border} />
              <Text col={colors.textMuted} fos={fontSize.body} lh={22}>
                {hasRating ? fmt.rating(rating) : null}
                <Text col={colors.textPlaceholder}>
                  {hasRating ? ` (${listing.ratingCount ?? 0})` : t('noRating')}
                  {listing.completedTripCount > 0
                    ? ` · ${t('rentals', { count: listing.completedTripCount })}`
                    : ''}
                </Text>
              </Text>
            </XStack>
            <XStack f={1} ai="baseline" gap={6} flexWrap="wrap">
              {displayPrice ? (
                <>
                  {selfDrive && discount > 0 && listing.weekdayPrice ? (
                    <Text
                      col={colors.textDisabled}
                      fos={fontSize.body}
                      lh={22}
                      textDecorationLine="line-through"
                    >
                      {compactPrice(listing.weekdayPrice)}
                    </Text>
                  ) : null}
                  <Text col={colors.primary} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                    {compactPrice(displayPrice)}
                  </Text>
                  <Text col={colors.placeholder} fos={fontSize.body} lh={22}>
                    {priceUnit}
                  </Text>
                  {driverPriceNote ? (
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {driverPriceNote}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text col={colors.primary} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                  {t('contactForQuote')}
                </Text>
              )}
            </XStack>
            <FavoriteButton vehicleId={listing.id} vehicleName={listing.name} variant="list" />
          </XStack>

          {location ? (
            <XStack ai="center" gap={space.sm}>
              {/* Nơi có xe — web `/home/card-location.svg`, Figma List: icon 20, cách chữ 8. */}
              <ShopLocationIcon color={colors.textPlaceholder} size={20} />
              <Text
                f={1}
                col={colors.textMuted}
                fos={fontSize.body}
                lh={CLAMPED_LINE_HEIGHT}
                numberOfLines={1}
              >
                {location}
              </Text>
            </XStack>
          ) : null}

          {listSpecs.length > 0 ? (
            <XStack gap={space.md - space.xs} my={space.xs} accessibilityLabel={t('specsLabel')}>
              {listSpecs.map((spec) => (
                // Figma List `.specBox`: các ô chia đều, icon trên chữ dưới, nền gray-50, bo 12, không viền.
                <YStack
                  key={spec.key}
                  flexBasis={0}
                  flexGrow={1}
                  ai="center"
                  jc="center"
                  gap={2}
                  px={space.sm}
                  py={6}
                  br={radius.control}
                  bg={dark ? colors.surfaceElevated : colors.background}
                >
                  <Ionicons name={spec.icon} size={16} color={colors.primaryHover} />
                  <Text
                    col={colors.textMuted}
                    fos={fontSize.body}
                    lh={CLAMPED_LINE_HEIGHT}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {spec.label}
                  </Text>
                </YStack>
              ))}
            </XStack>
          ) : null}

          {/* Hàng đáy ≤860px: chủ xe · "Xem chi tiết" một hàng, chỉ số chủ xe xuống dòng riêng. */}
          <YStack gap={space.sm + space.xs}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Pressable
                onPress={openShop}
                accessibilityRole="button"
                accessibilityLabel={
                  isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
                }
                style={{ flex: 1 }}
              >
                <XStack ai="center" gap={10}>
                  <HomeCardAvatar
                    name={listing.shopName}
                    url={listing.shopLogoUrl}
                    size={SHOP_AVATAR}
                    verified={isShopTrack}
                    markDisc={12}
                    markIcon={9}
                  />
                  <YStack f={1}>
                    <Text col={colors.placeholder} fos={fontSize.bodySm}>
                      {t(isShopTrack ? 'shop' : 'owner')}
                    </Text>
                    <Text
                      col={isShopTrack ? shopNameColor : colors.textMuted}
                      fos={fontSize.body}
                      lh={CLAMPED_LINE_HEIGHT}
                      fow={fontWeight.medium}
                      numberOfLines={1}
                    >
                      {listing.shopName}
                    </Text>
                  </YStack>
                </XStack>
              </Pressable>
              {open ? (
                <Pressable onPress={open} accessibilityRole="link" hitSlop={space.sm}>
                  <XStack ai="center" gap={6}>
                    <Text
                      col={colors.primary}
                      fos={fontSize.body}
                      lh={22}
                      fow={fontWeight.semibold}
                    >
                      {tResults('viewDetail')}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color={colors.primary} />
                  </XStack>
                </Pressable>
              ) : null}
            </XStack>
            {hostMetrics ? <HostMetrics metrics={hostMetrics} inlineLabels /> : null}
          </YStack>
        </YStack>
      </Card>
    );
  }

  return (
    <Card
      padded={false}
      seamless
      {...darkBorder}
      pressHighlight
      highlighted={highlighted}
      {...(open
        ? { onPress: open, accessibilityLabel: t('viewDetail', { name: listing.name }) }
        : {})}
    >
      {/* Figma "Vehicle Card" `22185:87092`: ảnh lọt trong đệm 8, bo 12. */}
      <YStack px={CARD_INSET} pt={CARD_INSET}>
        <YStack aspectRatio={PHOTO_RATIO} br={PHOTO_RADIUS} ov="hidden">
          <HighlightZoom>
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              accessibilityLabel={listing.name}
              fallback={<Ionicons name="car-sport-outline" size={40} color={colors.border} />}
            />
          </HighlightZoom>

          {/* Trái tim "Xe yêu thích" góc trên-phải ảnh - `.favoriteBtn` của web. */}
          <XStack pos="absolute" top={HEART_INSET} right={HEART_INSET} zi={1}>
            <FavoriteButton vehicleId={listing.id} vehicleName={listing.name} variant="photo" />
          </XStack>

          {/*
            Trên ảnh chỉ còn "% giảm" (Figma "Promotion Badge"); "Đặt ngay" xuống hàng tiện ích.
            % giảm là của giá TỰ LÁI - ngữ cảnh khác không mang nó (ADR 0011).
          */}
          {selfDrive && discount > 0 ? (
            <XStack pos="absolute" top={HEART_INSET} left={HEART_INSET}>
              <DiscountBadge percent={discount} />
            </XStack>
          ) : null}

          <PhotoAmenityPills items={amenities} />
        </YStack>
      </YStack>

      <YStack p={space.sm} gap={6}>
        <YStack gap={space.xs}>
          {/* Tên + "Xe mới" bên trái, điểm đánh giá bên phải (Figma "Vehicle Name Row"). */}
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack f={1} minWidth={0} ai="center" gap={6}>
              <Text
                flexShrink={1}
                // Web `.card:hover .title` - tên xe sang `color-primary`.
                col={highlighted ? colors.primary : colors.text}
                fos={fontSize.bodyLg}
                lh={24}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {listing.name}
              </Text>
              {/* Chưa có đánh giá nào = xe mới lên chợ - cùng luật với web. */}
              {hasRating ? null : <NewVehicleBadge />}
            </XStack>
            {hasRating ? (
              <XStack flexShrink={0} ai="center" gap={space.xs}>
                <Ionicons name="star" size={iconSize.sm} color={market.star} />
                <Text col={colors.textMuted} fos={fontSize.body} lh={22}>
                  {t.rich('ratingValue', {
                    rating: fmt.rating(rating),
                    count: listing.ratingCount ?? 0,
                    muted: (chunks) => <Text col={colors.placeholder}>{chunks}</Text>,
                  })}
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <XStack h={ROW_LOCATION} ai="center" gap={space.sm}>
            {location ? (
              <>
                <YStack w={20} h={20} ai="center" jc="center">
                  <SvgXml
                    xml={CARD_ICON_XML.location}
                    width={15}
                    height={19}
                    color={XP_TOKENS['color-text-placeholder']}
                  />
                </YStack>
                <Text
                  f={1}
                  col={colors.textMuted}
                  fos={fontSize.body}
                  lh={CLAMPED_LINE_HEIGHT}
                  numberOfLines={1}
                >
                  {location}
                </Text>
              </>
            ) : null}
          </XStack>
        </YStack>

        {/* Figma "Vehicle Specifications": kẻ trên + dưới, đệm 8 x 12, icon + chữ 14/22. */}
        <YStack h={1} bg={specDivider} />
        <XStack
          h={ROW_SPECS}
          ai="center"
          jc="space-between"
          px={space.md - space.xs}
          accessibilityLabel={t('specsLabel')}
        >
          {specs.map((spec) => (
            <XStack key={spec.key} ai="center" gap={space.xs}>
              <YStack w={16} h={16} ai="center" jc="center">
                <SvgXml
                  xml={SPEC_ICON_XML[spec.key as keyof typeof SPEC_ICON_XML].xml}
                  width={SPEC_ICON_XML[spec.key as keyof typeof SPEC_ICON_XML].w}
                  height={SPEC_ICON_XML[spec.key as keyof typeof SPEC_ICON_XML].h}
                  color={XP_TOKENS['color-text-placeholder']}
                />
              </YStack>
              <Text col={colors.textMuted} fos={fontSize.body} lh={22}>
                {spec.label}
              </Text>
            </XStack>
          ))}
        </XStack>
        <YStack h={1} bg={specDivider} />

        {/*
          Hàng đáy (Figma `22185:87150`): chủ xe bên trái, giá bên phải. Hàng gian hàng là một đích
          chạm RIÊNG lồng trong thẻ - như web lồng `<Link>` sang `/shops/[slug]`.
        */}
        <XStack minHeight={ROW_FOOTER} ai="flex-end" jc="space-between" gap={space.sm}>
          <Pressable
            onPress={() => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug))}
            accessibilityRole="button"
            // `accessibilityLabel` THAY mọi chữ bên trong - nhãn xác minh ghép ở tầng BẢN DỊCH.
            accessibilityLabel={
              isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
            }
            style={footerStyles.shop}
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
              <YStack f={1} minWidth={0} gap={0}>
                <Text col={colors.placeholder} fos={fontSize.bodySm}>
                  {t(isShopTrack ? 'shop' : 'owner')}
                </Text>
                {/* Web: tên gian hàng primary-hover, chủ xe cá nhân text-secondary. */}
                <Text
                  col={isShopTrack ? shopNameColor : colors.textMuted}
                  fos={fontSize.body}
                  lh={22}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {listing.shopName}
                </Text>
              </YStack>
            </XStack>
          </Pressable>

          <YStack flexShrink={0} ai="flex-end">
            {displayPrice ? (
              <>
                {selfDrive && discount > 0 && listing.weekdayPrice ? (
                  // Figma "Price Details": giá gốc 12/18 gạch ngang, nằm TRÊN giá bán.
                  <Text
                    col={colors.textDisabled}
                    fos={fontSize.bodySm}
                    lh={18}
                    mb={-6}
                    textDecorationLine="line-through"
                  >
                    {compactPrice(listing.weekdayPrice)}
                  </Text>
                ) : null}
                <XStack ai="baseline">
                  {/* Figma `22185:87154`: 18/28 semibold vàng (hover `primary-hover`). */}
                  <Text
                    col={highlighted ? colors.primaryHover : colors.primary}
                    fos={fontSize.h3}
                    lh={28}
                    fow={fontWeight.semibold}
                  >
                    {compactPrice(displayPrice)}
                  </Text>
                  <Text col={colors.placeholder} fos={fontSize.body} lh={22}>
                    {priceUnit}
                  </Text>
                </XStack>
              </>
            ) : (
              // Dịch vụ đang active chưa niêm yết giá - KHÔNG trưng giá của dịch vụ khác thay.
              <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {t('contactForQuote')}
              </Text>
            )}
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * Hai nhãn của thẻ xe — MỘT kiểu cho mọi biến thể (lưới trang chủ, danh sách màn Tìm xe, trang gian
 * hàng). Thẻ lưới đưa "Đặt ngay" xuống hàng tiện ích (viên hồng); cạnh tên thẻ danh sách là viên
 * xanh nhạt; "Xe mới" viên xanh lá nhạt, chữ 12/18 medium, đệm 4/8.
 */
function InstantBookBadge() {
  const colors = useColors();
  const t = useTranslations('Listings.card');
  return (
    <XStack bg={colors.infoSurface} br={radius.pill} px={space.sm} py={space.xs}>
      <Text col={colors.infoStrong} fos={fontSize.label} lh={18} fow={fontWeight.medium}>
        {t('instantBook')}
      </Text>
    </XStack>
  );
}

/**
 * Bọc `memo`: đây là hàng trong danh sách kết quả, và màn đó dựng lại vì đủ thứ không liên quan
 * tới một chiếc xe cụ thể (đo chiều cao khối lọc, tải thêm trang, đổi thứ tự sắp xếp).
 *
 * Chỉ có tác dụng khi nơi gọi truyền `onPress` ỔN ĐỊNH — `SearchResultsScreen` dùng
 * `useCallback` đúng vì lý do đó.
 */
/**
 * Huy hiệu "N% off" — `DiscountTag variant="badge"` của web: nền gradient vàng nhạt
 * `gradient-gold-soft`, bo `border-radius-chip`, đệm xs × 6, chữ label medium màu chữ bảng SÁNG
 * (nền là màu sáng cố định ở cả hai giao diện). Dùng trên ảnh thẻ lưới và ở hàng tên thẻ ngang.
 */
function DiscountBadge({ percent }: { percent: number }) {
  const tCommon = useTranslations('Common.components');
  return (
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
        accessibilityLabel={tCommon('discount', { percent })}
      >
        {tCommon('discountBadge', { percent })}
      </Text>
    </LinearGradient>
  );
}

export const VehicleCard = memo(VehicleCardImpl);
