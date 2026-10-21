import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RENTAL_MODE,
  CATALOG_TYPE,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  type ServiceType,
} from '@xeprime/types';
import {
  applyDiscountPercent,
  appWallClockToIso,
  isNewListing,
  LIST_SEPARATOR,
  mapExternalUrl,
  toGeoPoint,
  type RentalMode,
} from '@xeprime/domain';
import { rememberedOrDefaultRentalRange } from '@/lib/rental-range-memory';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { catalogLabel } from '@/api/catalog';
import { AppHeader } from '@/components/layout/AppHeader';
import { MapPreview } from '@/components/map/MapPreview';
import { ScreenError } from '@/components/state/ScreenError';
import { ListingDetailSkeleton } from '@/components/ui/Skeleton';
import { ShopQuickInfoCard } from '@/components/shop/ShopQuickInfoCard';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { GradientButton } from './components/home/GradientButton';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { useShopChatAvailable } from '@/features/chat/hooks/use-shop-chat-available';
import { Card } from '@/components/ui/Card';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { Stars } from '@/components/ui/Stars';
import type { IconName } from '@/components/ui/Chip';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { pickupMapUri } from '@/lib/map-static';
import { ROUTES } from '@/navigation/routes';
import type { BookingRequestPrefillParams } from '@/navigation/routes-base';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useListing, useListingReviews } from './hooks/use-marketplace-data';
import type { PublicListingDetail } from './api';
import { FeatureChip } from './components/FeatureChip';
import { ListingGalleryThumbs } from './components/ListingGalleryThumbs';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { ListingBenefitsCard } from './components/ListingBenefitsCard';
import { ListingBookingCard, type ListingTripDraft } from './components/ListingBookingCard';
import { ListingPoliciesTabs } from './components/ListingPoliciesTabs';

/**
 * Dịch vụ mở sẵn khi vào trang: ngữ cảnh mang từ danh sách sang nếu xe phục vụ được → ưu tiên
 * tự lái → dịch vụ đầu tiên.
 *
 * Là hàm THUẦN ở module scope vì hai nơi cần cùng câu trả lời: khối giá bên trong thân trang và
 * thanh CTA đáy nằm ngoài vùng cuộn. Hai bản `useState` khởi tạo khác nhau là chỗ trang hiện
 * giá "có tài xế" trong khi nút mở wizard "tự lái".
 */
function defaultServiceOf(
  services: readonly string[],
  initialServiceType: string | undefined,
): string {
  if (initialServiceType && services.includes(initialServiceType)) return initialServiceType;
  if (services.includes(SERVICE_TYPE.SELF_DRIVE)) return SERVICE_TYPE.SELF_DRIVE;
  return services[0] ?? SERVICE_TYPE.SELF_DRIVE;
}

/** Ảnh 4:3 — cao hơn thẻ ở danh sách vì đây là chỗ khách thật sự ngắm xe. */
const PHOTO_RATIO = 4 / 3;

/** Cuộn qua bao nhiêu thì tiêu đề hiện lên header nổi. Bằng non nửa chiều cao ảnh. */
const TITLE_REVEAL = 160;

/** Mô tả dài hơn chừng này thì thu gọn còn 4 dòng, kèm "Xem tiếp" — như `ListingDescription` web. */
const DESCRIPTION_CLAMP_CHARS = 220;

/**
 * Trang chi tiết xe công khai (MKT-04) — bản native của `ListingDetailView.tsx`.
 *
 * Cùng thứ tự khối với web: ảnh → tên → chọn dịch vụ → giá → tiện ích → bảo đảm & giấy tờ →
 * thông số → tính năng → gian hàng → mô tả → đánh giá → điểm nhận xe.
 *
 * `activeService` là state của MÀN HÌNH (web đọc từ `?serviceType=`): selector, khối giá và
 * điều kiện giấy tờ cùng đọc một giá trị, nên không bao giờ một chỗ nói dịch vụ này còn chỗ
 * khác nói dịch vụ kia.
 */
export function ListingDetailScreen({
  vehicleId,
  initialServiceType,
  onBack,
}: {
  vehicleId: string;
  /** Ngữ cảnh dịch vụ mang từ thẻ xe sang — cùng vai trò `?serviceType=` bên web. */
  initialServiceType?: string;
  onBack: () => void;
}) {
  const colors = useColors();
  const listing = useListing(vehicleId);
  const [scrolled, setScrolled] = useState(false);
  /*
   * Chuyến khách đang cấu hình sống ở VỎ, không trong `DetailBody`: thanh "Thuê xe" đáy màn nằm
   * ngoài vùng cuộn và phải mang ĐÚNG chuyến đó sang luồng gửi yêu cầu (prefill — web #205).
   *
   * `null` = chưa có dữ liệu xe nên chưa suy được mặc định.
   */
  const [trip, setTrip] = useState<ListingTripDraft | null>(null);
  const [initialRange, setInitialRange] = useState<{
    pickupAt: string;
    returnAt: string;
    rentalMode: RentalMode;
  } | null>(null);

  // Khoảng thuê mặc định = lựa chọn khách đã nhớ, hoặc gợi ý — cùng nguồn với thẻ tìm kiếm.
  useEffect(() => {
    let alive = true;
    void rememberedOrDefaultRentalRange().then((range) => {
      if (!alive) return;
      setInitialRange({
        pickupAt: appWallClockToIso(range.pickupAt),
        returnAt: appWallClockToIso(range.returnAt),
        rentalMode: range.mode,
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const passed = event.nativeEvent.contentOffset.y > TITLE_REVEAL;
    // Chỉ set khi giá trị thực sự đổi — `onScroll` bắn liên tục, render lại cả trang mỗi khung
    // hình là giật ngay trên máy tầm trung.
    setScrolled((prev) => (prev === passed ? prev : passed));
  }, []);

  if (listing.isError) {
    return (
      <YStack f={1} bg={colors.background}>
        <AppHeader onBack={onBack} />
        <ScreenError error={listing.error} onRetry={() => void listing.refetch()} />
      </YStack>
    );
  }

  if (listing.isPending) {
    return (
      // Overlay y như khi đã có dữ liệu — đổi kiểu header giữa chừng làm nút Lui nhảy chỗ.
      <YStack f={1} bg={colors.background}>
        <AppHeader variant="overlay" onBack={onBack} />
        <ListingDetailSkeleton />
      </YStack>
    );
  }

  const current: ListingTripDraft = trip ?? {
    serviceType: defaultServiceOf(listing.data.serviceTypes ?? [], initialServiceType),
    pickupAt: initialRange?.pickupAt ?? null,
    returnAt: initialRange?.returnAt ?? null,
    rentalMode: initialRange?.rentalMode ?? RENTAL_MODE.DAILY,
    routeType: ROUTE_TYPE.IN_CITY,
    packageMonths: listing.data.longTermPackages?.[0]?.packageMonths ?? null,
    pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
    requestedPickupDate: '',
    deliveryRequested: false,
    delivery: null,
    driverPickup: null,
    destination: '',
    promoCode: null,
    vehicleProtectionSelected: false,
    personalAccidentSelected: false,
  };
  const patchTrip = (patch: Partial<ListingTripDraft>) =>
    setTrip((prev) => ({ ...(prev ?? current), ...patch }));

  return (
    <YStack f={1} bg={colors.background}>
      {/*
        Header NỔI lên trên ảnh: ảnh chạm mép trên màn hình, nên một thanh đặc phía trên sẽ cắt
        mất phần đẹp nhất của tấm ảnh. Tiêu đề chỉ hiện sau khi cuộn qua ảnh — lúc đó tên xe ở
        thân trang đã khuất và header mới cần nhắc lại nó.
      */}
      <AppHeader variant="overlay" onBack={onBack} title={listing.data.name} showTitle={scrolled} />
      <DetailBody
        listing={listing.data}
        trip={current}
        onTripChange={patchTrip}
        onScroll={onScroll}
        refreshing={listing.isRefetching}
        onRefresh={() => void listing.refetch()}
      />

      {/*
        Thanh hành động DÍNH ĐÁY — lối duy nhất vào luồng gửi yêu cầu thuê. Web đặt nút "Thuê xe"
        trong thẻ đặt xe ở cột phải luôn nhìn thấy; native không có cột phải, nên nút nổi trên nội
        dung và mang theo chuyến khách vừa cấu hình.
      */}
      <RequestBar
        vehicleId={listing.data.id}
        shopSlug={listing.data.shopSlug}
        shopChatOpen={listing.data.shopChatOpen}
        trip={current}
        {...(listing.data.provinceCode ? { provinceCode: listing.data.provinceCode } : {})}
      />
    </YStack>
  );
}

/**
 * Thanh CTA đáy màn chi tiết xe.
 *
 * Mang theo CHUYẾN đang cấu hình (dịch vụ, khoảng thuê, lộ trình, gói, cách nhận xe) để luồng gửi
 * yêu cầu mở ra đúng thứ khách vừa xem giá — cùng vai trò `prefill` của `RequestBookingButton` web.
 * Không tự gửi gì: khách vẫn soát lại và tự bấm gửi ở màn Xem lại (ADR 0060).
 */
/**
 * Tham số mở luồng gửi yêu cầu — y hệt `prefill` mà `ListingBookingCard` web giao cho
 * `RequestBookingButton`, KỂ CẢ những chỗ web chưa mang sang (nguyện vọng ngày nhận, ngày cụ thể,
 * điểm đến, địa chỉ đón có tài xế). `autoContinue` chép nguyên điều kiện web, kể cả lỗi M3: với
 * có tài xế / dài hạn nó đòi dữ liệu mà prefill không mang sang — ghi ở sổ đồng bộ, mục "Lỗi WEB
 * ghi nhận" (M3). Không tự sửa hành vi ở app.
 */
function requestPrefill(
  trip: ListingTripDraft,
  listingProvinceCode: string | undefined,
): BookingRequestPrefillParams {
  const longTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;
  // Web: có tài xế lấy tỉnh của địa chỉ đón, còn lại tỉnh của địa chỉ giao — rồi tới tỉnh của xe.
  const province =
    (withDriver ? trip.driverPickup?.provinceCode : trip.delivery?.provinceCode) ??
    listingProvinceCode;
  const delivery = !withDriver && trip.deliveryRequested ? trip.delivery : null;
  const autoContinue = longTerm
    ? trip.packageMonths != null &&
      (trip.pickupPreference !== PICKUP_PREFERENCE.SPECIFIC_DATE ||
        Boolean(trip.requestedPickupDate)) &&
      (!trip.deliveryRequested || Boolean(trip.delivery))
    : withDriver
      ? Boolean(
          trip.pickupAt &&
          trip.returnAt &&
          trip.driverPickup &&
          (trip.routeType === ROUTE_TYPE.IN_CITY || trip.destination.trim()),
        )
      : Boolean(trip.pickupAt && trip.returnAt) &&
        (!trip.deliveryRequested || Boolean(trip.delivery));

  return {
    serviceType: trip.serviceType,
    ...(province ? { provinceCode: province } : {}),
    ...(trip.pickupAt ? { pickupAt: trip.pickupAt } : {}),
    ...(trip.returnAt ? { returnAt: trip.returnAt } : {}),
    ...(withDriver ? { routeType: trip.routeType } : {}),
    ...(longTerm && trip.packageMonths ? { packageMonths: String(trip.packageMonths) } : {}),
    ...(!withDriver && trip.deliveryRequested ? { delivery: '1' } : {}),
    ...(delivery
      ? {
          deliveryAddressLine: delivery.addressLine,
          ...(delivery.placeId ? { deliveryPlaceId: delivery.placeId } : {}),
          ...(delivery.latitude != null && delivery.longitude != null
            ? { deliveryLat: String(delivery.latitude), deliveryLng: String(delivery.longitude) }
            : {}),
        }
      : {}),
    ...(trip.promoCode ? { promoCode: trip.promoCode } : {}),
    ...(trip.vehicleProtectionSelected ? { vehicleProtection: '1' } : {}),
    ...(trip.personalAccidentSelected ? { personalAccident: '1' } : {}),
    ...(autoContinue ? { autoContinue: '1' } : {}),
  };
}

function RequestBar({
  vehicleId,
  shopSlug,
  shopChatOpen,
  trip,
  provinceCode,
}: {
  vehicleId: string;
  /** Gian hàng của chiếc xe — cổng nhắn tin hỏi theo GIAN HÀNG, không theo xe. */
  shopSlug: string;
  /** Gian hàng mở hộp thư công khai chưa; chưa thì nút hỏi tiếp cổng eligibility. */
  shopChatOpen: boolean;
  trip: ListingTripDraft;
  /** Tỉnh của chính chiếc xe — điền sẵn ô địa chỉ giao xe (ADR 0035). */
  provinceCode?: string;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const navigateOnce = useNavigateOnce();
  const insets = useSafeAreaInsets();
  /*
    Hỏi cổng nhắn tin Ở ĐÂY chứ không để nút tự giấu mình: ô `f={1}` bọc ngoài vẫn giữ nửa bề
    ngang kể cả khi ruột nó rỗng, nên nút đặt xe sẽ không bao giờ nở ra hết hàng.
  */
  const canChat = useShopChatAvailable(shopSlug, shopChatOpen);
  return (
    <YStack
      px={layout.screenX}
      pt={space.sm}
      pb={insets.bottom + space.sm}
      gap={space.sm}
      bg={colors.surface}
      borderTopWidth={1}
      borderColor={colors.borderSubtle}
      style={elevation.raised}
    >
      {/*
        "Nhắn shop" CẠNH nút đặt xe, đúng cặp web bày ở cột phải. Chủ xe cá nhân chưa mở kênh thì
        không có nút nhắn và nút đặt xe chiếm trọn bề ngang (cỡ `lg`); đứng cặp thì cỡ `md`.
      */}
      <XStack gap={space.sm}>
        {canChat ? (
          <YStack f={1}>
            <ShopChatButton
              shopSlug={shopSlug}
              vehicleId={vehicleId}
              publicChatOpen={shopChatOpen}
            />
          </YStack>
        ) : null}
        <YStack f={1}>
          {/* Nút "Thuê xe" của web (.ctaBtnWrapper): gradient-primary, bo border-radius-control. */}
          <GradientButton
            label={t('cta')}
            iconStart="car-sport-outline"
            radius={toPx(XP_TOKENS['border-radius-control'])}
            onPress={() =>
              navigateOnce(ROUTES.booking.request(vehicleId, requestPrefill(trip, provinceCode)))
            }
          />
        </YStack>
      </XStack>
    </YStack>
  );
}

function DetailBody({
  listing,
  trip,
  onTripChange,
  onScroll,
  refreshing,
  onRefresh,
}: {
  listing: PublicListingDetail;
  trip: ListingTripDraft;
  onTripChange: (patch: Partial<ListingTripDraft>) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Listings.detail');
  const tCard = useTranslations('Listings.card');
  const { catalog } = useCatalog();
  // Hãng + màu (web #212 `attributes`) — thiếu cái nào thì bỏ cái đó.
  const brandAttr = listing.brand
    ? catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand)
    : null;
  const colorAttr = listing.color?.trim() || null;
  const descriptionAttributes = [
    ...(brandAttr ? [{ key: 'brand' as const, value: brandAttr }] : []),
    ...(colorAttr ? [{ key: 'color' as const, value: colorAttr }] : []),
  ];
  const insets = useSafeAreaInsets();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const activeService = trip.serviceType;

  // % khuyến mãi trực tiếp là của giá TỰ LÁI (ADR 0011) — `PriceBlock` chỉ dùng nó ở nhánh tự lái.
  const discount = listing.discountPercent ?? 0;

  // Chưa có đánh giá nào = xe mới lên chợ — cùng luật với thẻ xe và với web.
  const isNewVehicle = isNewListing({
    ratingCount: listing.ratingCount ?? 0,
    ratingAvg: listing.ratingAvg,
  });
  // Địa chỉ THẬT của điểm nhận xe; không có thì không hiện dòng này, không dùng địa chỉ mẫu.
  const locationLine = [
    listing.pickupPoint?.address,
    listing.pickupPoint?.provinceName || listing.shopProvince,
  ]
    .filter(Boolean)
    .join(', ');

  /*
   * Bốn thông số tiêu biểu của bản vẽ v2. Thông số chủ xe CHƯA khai thì bỏ ô đó — không điền giá
   * trị mẫu (cùng luật `ListingDetailView` web sau khi bỏ giá trị giả).
   */
  const specs = [
    {
      key: 'seatCount',
      icon: 'people-outline' as const,
      label: t('specs.seats'),
      value: listing.seatCount ? tCard('seats', { count: listing.seatCount }) : null,
    },
    {
      key: 'bodyType',
      icon: 'car-outline' as const,
      label: t('specs.bodyType'),
      value: listing.bodyType
        ? (catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? null)
        : null,
    },
    {
      key: 'fuelType',
      icon: 'water-outline' as const,
      label: t('specs.fuelType'),
      value: listing.fuelType
        ? (catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? null)
        : null,
    },
    {
      key: 'manufactureYear',
      icon: 'calendar-outline' as const,
      label: t('specs.year'),
      value: listing.manufactureYear ? String(listing.manufactureYear) : null,
    },
  ].filter((spec): spec is typeof spec & { value: string } => spec.value != null);

  const share = () => {
    void Share.share({
      message: `${listing.name} — ${resolveWebBaseUrl()}/listings/${listing.id}`,
    }).catch(() => {});
  };

  return (
    <ScrollView
      // Màn tràn viền nên không có SafeAreaView bọc ngoài: lề đáy phải tự cộng inset, nếu
      // không khối cuối bị thanh điều hướng Android che mất.
      contentContainerStyle={{ paddingBottom: layout.section + insets.bottom }}
      onScroll={onScroll}
      scrollEventThrottle={scrollThrottle.half}
      // Kéo-làm-mới đặt ở ĐÂY: cử chỉ kéo chỉ nảy trên chính vùng đang cuộn.
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Gallery name={listing.name} mainImageUrl={listing.mainImageUrl} images={listing.images} />

      {/*
        Thứ tự khối = bản vẽ mobile v2 (Figma `19771:71482`) + nội dung của `ListingDetailView` web:
        tên · địa chỉ · thông số → lợi ích → thẻ đặt xe → mô tả → tiện ích → vị trí → chủ xe →
        Quy định & Chính sách → đánh giá.
      */}
      <YStack
        bg={colors.background}
        borderTopLeftRadius={radius.lg}
        borderTopRightRadius={radius.lg}
        marginTop={-layout.heroOverlap}
        px={layout.screenX}
        pt={layout.section}
        gap={layout.section}
      >
        <YStack gap={space.sm}>
          <XStack ai="flex-start" gap={space.sm}>
            <YStack f={1} gap={space.xs}>
              <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold}>
                {listing.name}
              </Text>
              <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
                {isNewVehicle ? <Badge tone="success" label={tCard('newVehicle')} /> : null}
                {listing.vatInvoiceSupported ? <Badge label={t('vatInvoice.badge')} /> : null}
              </XStack>
            </YStack>
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel={t('share.label')}
              hitSlop={space.sm}
            >
              <YStack
                w={sizing.touchTarget - space.sm}
                h={sizing.touchTarget - space.sm}
                br={radius.pill}
                ai="center"
                jc="center"
                bw={1}
                bc={colors.border}
              >
                <Ionicons name="share-social-outline" size={iconSize.md} color={colors.text} />
              </YStack>
            </Pressable>
          </XStack>

          {locationLine ? (
            <XStack ai="flex-start" gap={space.xs}>
              <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {locationLine}
              </Text>
            </XStack>
          ) : null}

          {specs.length > 0 ? (
            <XStack flexWrap="wrap" rowGap={space.md} pt={space.sm}>
              {specs.map((spec) => (
                <XStack key={spec.key} w="50%" ai="center" gap={space.sm}>
                  <YStack
                    w={40}
                    h={40}
                    br={radius.pill}
                    ai="center"
                    jc="center"
                    bg={colors.surfaceSelected}
                  >
                    <Ionicons name={spec.icon} size={iconSize.md} color={colors.primary} />
                  </YStack>
                  <YStack f={1}>
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {spec.label}
                    </Text>
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {spec.value}
                    </Text>
                  </YStack>
                </XStack>
              ))}
            </XStack>
          ) : null}
        </YStack>

        <ListingBenefitsCard listing={listing} activeService={activeService} />

        <ListingBookingCard
          listing={listing}
          trip={trip}
          onChange={onTripChange}
          priceSlot={
            <PriceBlock
              activeService={activeService as ServiceType}
              listing={listing}
              discount={discount}
              packageMonths={trip.packageMonths}
            />
          }
        />

        <YStack gap={space.xs}>
          <SectionTitle icon="reader-outline">{t('description')}</SectionTitle>
          {/* Hãng + màu đầu khối mô tả — như web #212 (`ListingDescription.attributes`). */}
          {descriptionAttributes.map((attr) => (
            <XStack key={attr.key} ai="center" gap={space.xs}>
              <Ionicons
                name={attr.key === 'brand' ? 'car-outline' : 'color-palette-outline'}
                size={iconSize.sm}
                color={colors.textMuted}
              />
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {t.rich(`attributes.${attr.key}`, {
                  value: attr.value,
                  strong: (chunks) => (
                    <Text col={colors.text} fow={fontWeight.semibold}>
                      {chunks}
                    </Text>
                  ),
                })}
              </Text>
            </XStack>
          ))}
          <Text
            col={colors.textMuted}
            fos={fontSize.bodySm}
            {...(descriptionOpen ? {} : { numberOfLines: 4 })}
          >
            {listing.description || t('descriptionEmpty')}
          </Text>
          {listing.description && listing.description.length > DESCRIPTION_CLAMP_CHARS ? (
            <Pressable onPress={() => setDescriptionOpen((v) => !v)} accessibilityRole="button">
              <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {descriptionOpen ? t('descriptionToggle.less') : t('descriptionToggle.more')}
              </Text>
            </Pressable>
          ) : null}
        </YStack>

        {listing.features.length > 0 ? (
          <YStack gap={space.sm}>
            <SectionTitle icon="sparkles-outline">{t('sections.features')}</SectionTitle>
            <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
              {listing.features.map((key) => (
                <FeatureChip
                  key={key}
                  featureKey={key}
                  label={catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) ?? key}
                />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {/*
          Vị trí xe đứng TRƯỚC chủ xe — thứ tự một cột của web develop (`ListingDetailView.module.css`
          ≤1024px: location `order: 4`, host `order: 5`; Figma mobile `19771:71482`).
        */}
        {listing.pickupPoint ? (
          <PickupPointCard listingId={listing.id} point={listing.pickupPoint} />
        ) : null}

        {/*
          Thẻ gian hàng + ba chỉ số uy tín (ADR 0045 điều 3) — số của GIAN HÀNG (`shopRatingAvg`,
          `shopRatingCount`, `shopCompletedTripCount`), không phải của riêng chiếc xe.
        */}
        <YStack gap={space.sm}>
          <SectionTitle icon="person-circle-outline">{t('sections.host')}</SectionTitle>
          <ShopQuickInfoCard
            shop={{
              name: listing.shopName,
              slug: listing.shopSlug,
              logoUrl: listing.shopLogoUrl,
              verified: listing.shopVerified,
              province: listing.shopProvince,
              bio: listing.shopBio,
              ratingAvg: listing.shopRatingAvg,
              ratingCount: listing.shopRatingCount,
              completedTripCount: listing.shopCompletedTripCount,
            }}
            metrics={listing.shopMetrics}
            variant="inline"
          />
        </YStack>

        <ListingPoliciesTabs listing={listing} activeService={activeService} />

        <Reviews vehicleId={listing.id} />
      </YStack>
    </ScrollView>
  );
}

/**
 * Khối giá theo dịch vụ đang chọn:
 *   - dài hạn → giá tháng; chưa niêm yết → "Liên hệ báo giá thuê dài hạn";
 *   - có tài xế → giá/ngày đã gồm tài xế; chưa niêm yết → "Liên hệ báo giá chuyến có tài xế";
 *   - tự lái → giá ngày sau khuyến mãi, kèm giá gạch và nhãn giảm.
 */
function PriceBlock({
  activeService,
  listing,
  discount,
  packageMonths = null,
}: {
  activeService: ServiceType;
  listing: PublicListingDetail;
  discount: number;
  packageMonths?: number | null;
}) {
  const colors = useColors();
  const tFlow = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();

  /*
   * Giá NIÊM YẾT của dịch vụ đang chọn — như web: dài hạn đọc giá gói đang chọn, có tài xế đọc
   * giá có tài xế, tự lái đọc giá ngày. % khuyến mãi trực tiếp chỉ là của TỰ LÁI (ADR 0011).
   * Chưa niêm yết thì không hiện dòng giá (báo giá server ở "Thành tiền" vẫn là nguồn chốt).
   */
  const listedPrice =
    activeService === SERVICE_TYPE.LONG_TERM
      ? (listing.longTermPackages?.find((pkg) => pkg.packageMonths === packageMonths)
          ?.baseMonthlyPrice ??
        listing.monthlyPrice ??
        null)
      : activeService === SERVICE_TYPE.WITH_DRIVER
        ? (listing.withDriverDailyPrice ?? null)
        : (listing.weekdayPrice ?? null);
  const priceDiscount = activeService === SERVICE_TYPE.SELF_DRIVE ? discount : 0;
  const shownPrice =
    listedPrice && priceDiscount > 0
      ? (applyDiscountPercent(listedPrice, priceDiscount) ?? listedPrice)
      : listedPrice;
  const unit =
    activeService === SERVICE_TYPE.LONG_TERM ? tFlow('price.perMonth') : tFlow('price.perDay');

  if (!shownPrice) return null;

  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <XStack f={1} ai="baseline" gap={space.sm} rowGap={space.xs} flexWrap="wrap">
        {priceDiscount > 0 && listedPrice ? (
          <Text col={colors.textDisabled} fos={fontSize.body} textDecorationLine="line-through">
            {fmt.money(listedPrice)}
          </Text>
        ) : null}
        <PriceRow amount={fmt.money(shownPrice)} unit={unit} />
      </XStack>
      {priceDiscount > 0 ? (
        // Như thẻ đặt xe web develop (`DiscountTag` pill, `--xp-color-discount`).
        <DiscountTag percent={priceDiscount} />
      ) : null}
    </XStack>
  );
}

function PriceRow({ amount, unit }: { amount: string; unit: string }) {
  const colors = useColors();
  return (
    <XStack ai="baseline" gap={space.xs}>
      <Text col={colors.primary} fos={fontSize.h1} fow={fontWeight.bold}>
        {amount}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {unit}
      </Text>
    </XStack>
  );
}

/** Dịch vụ chưa niêm yết giá — nói rõ phải liên hệ, không trưng giá của dịch vụ khác thay. */
function Gallery({
  name,
  mainImageUrl,
  images,
}: {
  name: string;
  mainImageUrl?: string | null;
  images: string[];
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const pagerRef = useRef<ScrollView>(null);
  const tGallery = useTranslations('Listings.detail.gallery');
  const tStates = useTranslations('Common.states');

  // Ảnh chính đứng đầu và không lặp lại nếu nó cũng nằm trong thư viện.
  const all = [mainImageUrl, ...images].filter((url): url is string => Boolean(url));
  const unique = all.filter((url, index) => all.indexOf(url) === index);
  const height = width / PHOTO_RATIO;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setActive(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)));
    },
    [width],
  );

  const jumpTo = useCallback(
    (index: number) => {
      setActive(index);
      pagerRef.current?.scrollTo({ x: index * width, animated: true });
    },
    [width],
  );

  if (unique.length === 0) {
    return (
      <YStack w="100%" h={height} bg={colors.surfaceMuted} ai="center" jc="center">
        <Ionicons name="car-sport-outline" size={48} color={colors.border} />
      </YStack>
    );
  }

  return (
    <YStack>
      <YStack>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
        >
          {unique.map((url, index) => (
            <Pressable
              key={url}
              onPress={() => setViewing(url)}
              accessibilityRole="imagebutton"
              accessibilityLabel={tGallery('photoAlt', { name, index: index + 1 })}
            >
              <Image
                source={{ uri: url }}
                style={{ width, height }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={url}
                transition={150}
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Nhiều ảnh thì dải ảnh nhỏ nằm giữa ảnh và phần thân, nên bộ đếm chỉ cần cách mép ảnh. */}
        {unique.length > 1 ? (
          <XStack
            pos="absolute"
            bottom={space.sm}
            right={space.md}
            bg={colors.surface}
            br={radius.pill}
            px={space.sm}
            py={space.xs}
          >
            <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
              {active + 1}/{unique.length}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      {/*
        Phần thân trang lùi lên `heroOverlap` rồi đệm đầu `layout.section`: dải ảnh nằm TRÊN nó (zIndex)
        và chỉ giữ lại đủ đệm để khoảng tới tên xe còn `space.md`, không phải nguyên một khoảng section.
      */}
      {unique.length > 1 ? (
        <YStack zIndex={1} pb={Math.max(0, layout.heroOverlap - layout.section + space.md)}>
          <ListingGalleryThumbs urls={unique} active={active} onSelect={jumpTo} />
        </YStack>
      ) : null}

      <PhotoViewer
        url={viewing}
        unavailableLabel={tStates('imageUnavailable')}
        onClose={() => setViewing(null)}
      />
    </YStack>
  );
}

/** Đánh giá công khai. Tự ẩn khi lỗi hoặc chưa có — không kéo cả trang xuống màn lỗi. */
function Reviews({ vehicleId }: { vehicleId: string }) {
  const colors = useColors();
  const t = useTranslations('Listings.reviews');
  const fmt = useAppFormat();
  const { data } = useListingReviews(vehicleId);

  /*
   * `data?.summary?.ratingCount`: `useListingReviews` nuốt lỗi mạng thành `data = null`, nhưng
   * một phản hồi THÀNH CÔNG mà thiếu hẳn `summary` (dữ liệu cũ chưa qua đợt tính rating) vẫn để
   * `data` là object thật — `data.summary.ratingCount` lúc đó ném "Cannot read property
   * 'ratingCount' of undefined" đúng giữa trang chi tiết xe.
   */
  const hasReviews = Boolean(data?.summary?.ratingCount && data.summary.ratingCount > 0);

  return (
    <Card lift="flat">
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <SectionTitle icon="star-outline">{t('title')}</SectionTitle>
          {hasReviews ? (
            <XStack ai="center" gap={space.xs}>
              <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
                {fmt.rating(data!.summary.ratingAvg)}
              </Text>
              <Stars value={data!.summary.ratingAvg} />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('count', { count: data!.summary.ratingCount })}
              </Text>
            </XStack>
          ) : null}
        </XStack>

        {!hasReviews ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : (
          <YStack gap={space.md}>
            {data!.data.map((review, index) => (
              <YStack
                key={review.id}
                gap={space.xs}
                pt={index === 0 ? 0 : space.md}
                borderTopWidth={index === 0 ? 0 : 1}
                bc={colors.borderSubtle}
              >
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <XStack ai="center" gap={space.xs} f={1}>
                    <Text
                      col={colors.text}
                      fos={fontSize.bodySm}
                      fow={fontWeight.semibold}
                      numberOfLines={1}
                    >
                      {review.customerName}
                    </Text>
                    <Stars value={review.rating} />
                  </XStack>
                  <Text col={colors.placeholder} fos={fontSize.label}>
                    {fmt.date(review.createdAt)}
                  </Text>
                </XStack>
                {review.comment ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {review.comment}
                  </Text>
                ) : null}
              </YStack>
            ))}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}

/**
 * Khối ĐIỂM NHẬN XE — địa chỉ là thông tin chính, bản đồ chỉ minh hoạ, đúng như web
 * (`ListingDetailView`).
 *
 * Trước đợt này native cố ý bỏ trống phần bản đồ vì "cần một thư viện map riêng". Lý do đó đã
 * hết hiệu lực: ảnh tĩnh do API vẽ hộ (`/public/listings/:id/pickup-map`, Vietmap — ADR 0061
 * điều 1) là một tấm `<Image>`, không khoá nào trong bundle.
 *
 * Bản đồ TỰ BIẾN MẤT khi thiếu toạ độ hoặc ảnh lỗi; phần chữ và liên kết "Mở bằng Google Maps" ở
 * lại — cùng cách xử lý với `StaticMapImage` + `MapLink` bên web.
 */
function PickupPointCard({
  listingId,
  point,
}: {
  listingId: string;
  point: NonNullable<PublicListingDetail['pickupPoint']>;
}) {
  const colors = useColors();
  const t = useTranslations('Listings.detail');
  const tStates = useTranslations('Common.states');

  const geo = toGeoPoint(point.latitude, point.longitude);
  const mapUri = geo ? pickupMapUri(listingId, geo, point.address ?? '') : null;

  return (
    <Card lift="flat">
      <YStack gap={space.xs}>
        <SectionTitle icon="navigate-outline">{t('location.title')}</SectionTitle>
        <Body>{[point.branchName, point.address].filter(Boolean).join(LIST_SEPARATOR)}</Body>
        {point.provinceName ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {point.provinceName}
          </Text>
        ) : null}
        {geo && mapUri ? (
          <YStack gap={space.xs} mt={space.xs}>
            <MapPreview
              uri={mapUri}
              accessibilityLabel={t('pickupPoint.mapTitle')}
              busyLabel={tStates('loading')}
              onOpen={() => void Linking.openURL(mapExternalUrl(geo))}
              openLabel={t('pickupPoint.mapTitle')}
            />
            {/* Nhắc ra thành chữ: một tấm ảnh bản đồ không tự nói rằng nó bấm được. */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('location.openMap')}
              onPress={() => void Linking.openURL(mapExternalUrl(geo))}
            >
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="map-outline" size={iconSize.sm} color={colors.primary} />
                <Text col={colors.primary} fos={fontSize.label} fow={fontWeight.semibold}>
                  {t('location.openMap')}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        ) : null}
      </YStack>
    </Card>
  );
}

function SectionTitle({ icon, children }: { icon: IconName; children: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={17} color={colors.primaryActive} />
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
        {children}
      </Text>
    </XStack>
  );
}

/**
 * Đoạn văn của các khối nội dung (mô tả, điểm nhận xe).
 *
 * Cùng cỡ và cùng màu với phần bình luận ở khối đánh giá — ba khối này đứng cạnh nhau, mỗi khối
 * một cỡ chữ thì trang đọc như ghép từ ba nơi khác nhau.
 */
function Body({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      col={colors.textMuted}
      fos={fontSize.bodySm}
      lineHeight={Math.round(fontSize.bodySm * 1.6)}
    >
      {children}
    </Text>
  );
}

/** Tiện ích nổi bật — viên gold nhạt viền mảnh, đúng `.amenityBadge` của web. */
function Badge({ label, tone = 'brand' }: { label: string; tone?: 'brand' | 'success' }) {
  const colors = useColors();
  const success = tone === 'success';
  return (
    <XStack
      bg={success ? colors.successSurface : colors.primaryLight}
      bw={1}
      bc={colors.borderSubtle}
      br={radius.pill}
      px={space.md}
      py={space.xs}
    >
      <Text
        col={success ? colors.success : colors.primaryActive}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
      >
        {label}
      </Text>
    </XStack>
  );
}
