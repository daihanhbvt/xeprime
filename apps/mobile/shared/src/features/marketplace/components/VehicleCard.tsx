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
import { RemoteImage } from '@/components/ui/RemoteImage';
import type { IconName } from '@/components/ui/Chip';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton';
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
import type { HostMetrics as HostMetricsShape } from '@xeprime/types';
import { HostMetrics } from './HostMetrics';
import { HomeCardAvatar } from './home/HomeCardAvatar';
import { STAR_ART } from './home/home-art';
import { ShopLocationIcon } from './shop-icons';

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
/** Ảnh thẻ ngang ở bề ngang hẹp (web `.listMedia` ≤860px `height: 180px`, trừ đệm 10 hai đầu). */
const LIST_PHOTO_HEIGHT = 160;
/** Ảnh của thẻ ngang chế độ "Danh sách" — 128 × 120 (web ≤640px `.listMedia` rộng 128). */
const ROW_PHOTO = { width: 128, height: 120 };

/** Trái tim trên ảnh: cách mép 12, đĩa 32 — `.favoriteBtn` của web. */
const HEART_INSET = toPx(XP_TOKENS['space-12']);
const HEART_DISC = 32;

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
        pressHighlight
        {...(open
          ? { onPress: open, accessibilityLabel: t('viewDetail', { name: listing.name }) }
          : {})}
      >
        <XStack p={space.sm} gap={12}>
          <YStack w={ROW_PHOTO.width} h={ROW_PHOTO.height} br={radius.control} ov="hidden">
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              accessibilityLabel={listing.name}
              fallback={<Ionicons name="car-sport-outline" size={32} color={colors.border} />}
            />
            {selfDrive && discount > 0 ? (
              <XStack pos="absolute" top={space.xs} left={space.xs}>
                <DiscountBadge percent={discount} />
              </XStack>
            ) : null}
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
            {instantBook || !hasRating ? (
              <XStack ai="center" gap={space.xs} flexWrap="wrap">
                {instantBook ? <InstantBookBadge /> : null}
                {!hasRating ? <NewVehicleBadge /> : null}
              </XStack>
            ) : null}
            {location ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="location-outline" size={iconSize.xs} color={colors.placeholder} />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {location}
                </Text>
              </XStack>
            ) : null}
            <XStack ai="baseline" jc="space-between" gap={space.xs}>
              {hasRating ? (
                <XStack ai="center" gap={2}>
                  <Ionicons name="star" size={12} color={STAR_ART} />
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {fmt.rating(rating)}
                    <Text col={colors.placeholder}>{` (${listing.ratingCount ?? 0})`}</Text>
                  </Text>
                </XStack>
              ) : (
                <YStack />
              )}
              {displayPrice ? (
                <XStack ai="baseline" gap={2}>
                  <Text col={colors.primary} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                    {compactPrice(displayPrice)}
                  </Text>
                  <Text col={colors.placeholder} fos={fontSize.bodySm}>
                    {priceUnit}
                  </Text>
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
          Khối chủ xe ĐẦY ĐỦ như thẻ lưới (người dùng chốt 27/10/2026): avatar + dấu xác minh, nhãn
          "Gian hàng"/"Chủ xe", tên — một đích chạm riêng sang trang gian hàng.
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
      </Card>
    );
  }

  if (variant === 'list') {
    // Chỉ thông số XE CÓ khai (web #222 bỏ các giá trị điền bừa khi thiếu dữ liệu).
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
    const openShop = () => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug));

    return (
      <Card
        padded={false}
        seamless
        pressHighlight
        {...(open
          ? { onPress: open, accessibilityLabel: t('viewDetail', { name: listing.name }) }
          : {})}
      >
        {/* `.listMedia` ≤860px: ảnh rộng hết thẻ, cao 180 gồm đệm 10, ảnh bo 12. */}
        <YStack p={10}>
          <YStack h={LIST_PHOTO_HEIGHT} br={radius.control} ov="hidden">
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              accessibilityLabel={listing.name}
              fallback={<Ionicons name="car-sport-outline" size={40} color={colors.border} />}
            />
            {extraPhotos > 0 ? (
              <XStack
                pos="absolute"
                right={8}
                bottom={8}
                ai="center"
                gap={space.xs}
                px={space.sm}
                py={2}
                br={radius.pill}
                bg={colors.overlay}
              >
                <Ionicons name="images-outline" size={11} color={colors.textInverse} />
                <Text col={colors.textInverse} fos={fontSize.label} fow={fontWeight.medium}>
                  {t('photoCount', { count: extraPhotos })}
                </Text>
              </XStack>
            ) : null}
          </YStack>
        </YStack>

        <YStack px={20} pt={4} pb={14} gap={space.sm}>
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
            {hasRating ? (
              <XStack ai="center" gap={space.xs}>
                {/* `.starIcon` web: sao vàng 14px (hex cứng #eab308) — màu tranh STAR_ART dùng chung với thẻ trang chủ. */}
                <Ionicons name="star" size={14} color={STAR_ART} />
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {fmt.rating(rating)}
                  <Text col={colors.textPlaceholder}>{` (${listing.ratingCount ?? 0})`}</Text>
                </Text>
              </XStack>
            ) : null}
            <XStack f={1} ai="baseline" gap={6} flexWrap="wrap">
              {displayPrice ? (
                <>
                  {selfDrive && discount > 0 && listing.weekdayPrice ? (
                    <Text
                      col={colors.textDisabled}
                      fos={fontSize.body}
                      textDecorationLine="line-through"
                    >
                      {compactPrice(listing.weekdayPrice)}
                    </Text>
                  ) : null}
                  <Text col={colors.primary} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                    {compactPrice(displayPrice)}
                  </Text>
                  <Text col={colors.placeholder} fos={fontSize.bodySm}>
                    {priceUnit}
                  </Text>
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
            <XStack ai="center" gap={6}>
              {/* Nơi có xe — web `/home/card-location.svg` (15×19, tô `text-placeholder`), chép đúng path. */}
              <ShopLocationIcon color={colors.textPlaceholder} size={15} />
              <Text f={1} col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
                {location}
              </Text>
            </XStack>
          ) : null}

          {listSpecs.length > 0 ? (
            <XStack flexWrap="wrap" gap={10} my={space.xs} accessibilityLabel={t('specsLabel')}>
              {listSpecs.map((spec) => (
                // Web `.specBox` (nền #fbfbfa, viền #f0f0ee — hex cứng) → token `background` / `borderSubtle`.
                <XStack
                  key={spec.key}
                  ai="center"
                  gap={6}
                  px={14}
                  py={6}
                  br={radius.sm}
                  bw={1}
                  bc={colors.borderSubtle}
                  bg={colors.background}
                >
                  <Ionicons name={spec.icon} size={14} color={colors.primaryHover} />
                  <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
                    {spec.label}
                  </Text>
                </XStack>
              ))}
            </XStack>
          ) : null}

          {/* Hàng đáy ≤860px: chủ xe · "Xem chi tiết" một hàng, chỉ số chủ xe xuống dòng riêng. */}
          <YStack borderTopWidth={1} bc={colors.borderSubtle} pt={10} gap={space.sm + space.xs}>
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
              {open ? (
                <Pressable onPress={open} accessibilityRole="link" hitSlop={space.sm}>
                  <XStack ai="center" gap={6}>
                    <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold}>
                      {tResults('viewDetail')}
                    </Text>
                    <Ionicons name="arrow-forward" size={iconSize.xs} color={colors.primaryHover} />
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
      pressHighlight
      highlighted={highlighted}
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
          Trái tim "Xe yêu thích" ở góc trên-phải ảnh — `.favoriteBtn` của web (12px từ mép). Nó
          thay chỗ mũi tên chi tiết cũ: cả thẻ đã là đích "mở chi tiết", web cũng không có mũi tên.
        */}
        <XStack pos="absolute" top={HEART_INSET} right={HEART_INSET} zi={1}>
          <FavoriteButton vehicleId={listing.id} vehicleName={listing.name} variant="photo" />
        </XStack>

        <XStack
          pos="absolute"
          top={space.sm}
          left={space.sm}
          right={HEART_INSET + HEART_DISC + space.sm}
          fd="column"
          ai="flex-start"
          gap={5}
        >
          {/* % giảm là của giá TỰ LÁI — ngữ cảnh khác không mang nó (ADR 0011). */}
          {selfDrive && discount > 0 ? (
            <DiscountBadge percent={discount} />
          ) : null}
          {instantBook ? <InstantBookBadge /> : null}
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
              // Web `.card:hover .title` — tên xe sang `color-primary`.
              col={highlighted ? colors.primary : colors.text}
              fos={fontSize.bodyLg}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {listing.name}
            </Text>
            {/* Chưa có đánh giá nào = xe mới lên chợ — cùng luật với web. */}
            {hasRating ? null : <NewVehicleBadge />}
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

        <XStack minHeight={ROW_FOOTER} ai="center" jc="space-between" gap={space.sm}>
          {hasRating ? (
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="star" size={iconSize.sm} color={market.star} />
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
                  // Web `.oldPrice`: body 14/22, `text-disabled`, gạch ngang.
                  <Text
                    col={colors.textDisabled}
                    fos={fontSize.body}
                    textDecorationLine="line-through"
                  >
                    {compactPrice(listing.weekdayPrice)}
                  </Text>
                ) : null}
                {/*
                  Web `.currentPrice b`: body-lg 16/24 semibold `color-primary` (hover `primary-hover`) —
                  trước đây app dùng h3, to hơn web (người dùng chốt 27/10/2026).
                */}
                <Text
                  col={highlighted ? colors.primaryHover : colors.primary}
                  fos={fontSize.bodyLg}
                  fow={fontWeight.semibold}
                >
                  {compactPrice(displayPrice)}
                </Text>
                {/* Web `.currentPrice`: body 14/22 `text-tertiary`. */}
                <Text col={colors.placeholder} fos={fontSize.body}>
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

        {/* Dòng chủ xe nằm ĐÁY thẻ, dưới hàng điểm/giá — đúng thứ tự thẻ web sau #222 (`.shop { margin-top: auto }`). */}
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
      </YStack>
    </Card>
  );
}

/**
 * Hai nhãn của thẻ xe — MỘT kiểu cho mọi biến thể (lưới trang chủ, danh sách màn Tìm xe, trang gian
 * hàng), theo thẻ trang chủ (người dùng chốt 29/10/2026): "Không cần xác nhận" nền gradient trên ảnh,
 * "Xe mới" viên xanh có viền cạnh tên.
 */
function InstantBookBadge() {
  const t = useTranslations('Listings.card');
  return (
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
  );
}

function NewVehicleBadge() {
  const colors = useColors();
  const t = useTranslations('Listings.card');
  return (
    <XStack bg={colors.successSurface} bw={1} bc={colors.successBorder} br={radius.pill} px={space.sm} py={1}>
      <Text col={colors.success} fos={fontSize.label} fow={fontWeight.medium}>
        {t('newVehicle')}
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
