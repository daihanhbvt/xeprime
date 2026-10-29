import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Linking,
  Pressable,
  ScrollView,
  Share,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MapPreview } from '@/components/map/MapPreview';
import { pickupMapUri } from '@/lib/map-static';
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
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { Avatar } from '@/components/ui/Avatar';
import { MarketSectionTitle } from '@/components/ui/MarketSectionTitle';
import { ListingDetailSkeleton } from '@/components/ui/Skeleton';
import { ShopQuickInfoCard } from '@/components/shop/ShopQuickInfoCard';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { GradientButton } from './components/home/GradientButton';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { useShopChatAvailable } from '@/features/chat/hooks/use-shop-chat-available';
import { Card } from '@/components/ui/Card';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { Stars } from '@/components/ui/Stars';
import { useCatalog } from '@/features/catalog/use-catalog';
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, sizing, space } from '@/theme/tokens';
import { ROUTES } from '@/navigation/routes';
import type { BookingRequestPrefillParams } from '@/navigation/routes-base';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useListing, useListingReviews } from './hooks/use-marketplace-data';
import type { PublicListingDetail } from './api';
import { FeatureItem } from './components/FeatureChip';
import { HomeCarousel } from './components/home/HomeCarousel';
import { STAR_ART } from './components/home/home-art';
import { ListingGalleryThumbs } from './components/ListingGalleryThumbs';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { ListingBenefitsCard } from './components/ListingBenefitsCard';
import {
  ListingBookingCard,
  type ListingTripDraft,
  type TripInputKind,
  type TripInputRequest,
} from './components/ListingBookingCard';
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

/** Tỉ lệ ảnh 358 × 170 của bản vẽ mobile (web ≤640px `.slide { aspect-ratio: 358 / 170 }`). */
const PHOTO_RATIO = 358 / 170;

/**
 * Cỡ chữ thân các khối nội dung (địa chỉ, mô tả, tiện ích, vị trí, chủ xe, đánh giá) — 13, nhỏ hơn
 * thân 14 chung của app (người dùng chốt 28/10/2026: chữ các khối này to hơn web).
 */
/** Một ô của lưới 2 cột (nửa bề ngang, khe phải 12) — prop tắt `pr` không qua được kiểu của YStack này. */
const HALF_CELL = { width: '50%', paddingRight: 12 } as const;
const BODY_TEXT = 13;

/** Khe giữa hai ảnh khi trượt — `.grid { gap: space-sm }` của web ≤640px. */
const SLIDE_GAP = space.sm;

/** Mô tả dài hơn chừng này thì thu gọn còn 4 dòng, kèm "Xem tiếp" — như `ListingDescription` web. */
const DESCRIPTION_CLAMP_CHARS = 220;

/**
 * Đĩa nút Chia sẻ / Yêu thích cạnh tên xe — `.actionBtn` của web ở ≤640px (bản mobile của mockup):
 * đĩa 32, icon 16, vùng chạm vẫn 44 (`::after` bên web ⇔ `hitSlop` ở đây).
 */
const ACTION_DISC = 32;

/** `.actionIcons` ≤640px: khoảng cách hai đĩa `--xp-space-12`. */
const ACTION_GAP = toPx(XP_TOKENS['space-12']);

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
  const tDetail = useTranslations('Listings.detail');
  const listing = useListing(vehicleId);
  /*
   * Chuyến khách đang cấu hình sống ở VỎ, không trong `DetailBody`: thanh "Thuê xe" đáy màn nằm
   * ngoài vùng cuộn và phải mang ĐÚNG chuyến đó sang luồng gửi yêu cầu (prefill — web #205).
   *
   * `null` = chưa có dữ liệu xe nên chưa suy được mặc định.
   */
  const [trip, setTrip] = useState<ListingTripDraft | null>(null);
  /** Lệnh mở ô còn thiếu trên thẻ đặt xe — "Chọn thuê" khi chuyến chưa đủ (xem `missingTripInput`). */
  const [inputRequest, setInputRequest] = useState<TripInputRequest | null>(null);
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

  /*
   * Header ĐẶC NỀN có tên trang — thanh "quay lại + đường dẫn" của web ≤640px (Figma `19771:72104`).
   * Ảnh đã thụt vào trong lề (không còn tràn mép trên), nên không còn lý do cho header nổi đè ảnh.
   * Cùng một header ở cả ba trạng thái: đổi kiểu giữa chừng làm nút Lui nhảy chỗ.
   */
  const header = <AppHeader onBack={onBack} title={tDetail('breadcrumb.current')} />;

  if (listing.isError) {
    return (
      <YStack f={1} bg={colors.background}>
        {header}
        <ScreenError error={listing.error} onRetry={() => void listing.refetch()} />
      </YStack>
    );
  }

  if (listing.isPending) {
    return (
      <YStack f={1} bg={colors.background}>
        {header}
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
      {header}
      {/*
        `Screen` giữ vùng cuộn + BÀN PHÍM (ô "Điểm đến" của thẻ đặt xe nằm sâu dưới màn — gõ vào
        là được đẩy lên trên bàn phím, cùng cơ chế các màn form của app Partner; người dùng chốt
        27/10/2026). Ẩn thanh đáy lúc đang gõ để nó không che ô.

        Thanh hành động DÍNH ĐÁY — lối duy nhất vào luồng gửi yêu cầu thuê. Web đặt nút "Thuê xe"
        trong thẻ đặt xe ở cột phải luôn nhìn thấy; native không có cột phải, nên nút nổi trên nội
        dung và mang theo chuyến khách vừa cấu hình.
      */}
      <Screen
        edges={['bottom']}
        padded={false}
        hideFooterWhileTyping
        refreshing={listing.isRefetching}
        onRefresh={() => void listing.refetch()}
        footer={
          <RequestBar
            vehicleId={listing.data.id}
            shopSlug={listing.data.shopSlug}
            shopChatOpen={listing.data.shopChatOpen}
            trip={current}
            onNeedInput={(kind) => setInputRequest({ kind, nonce: Date.now() })}
            {...(listing.data.provinceCode ? { provinceCode: listing.data.provinceCode } : {})}
          />
        }
      >
        <DetailBody
          listing={listing.data}
          trip={current}
          onTripChange={patchTrip}
          inputRequest={inputRequest}
        />
      </Screen>
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

/**
 * Ô CÒN THIẾU để chuyến đủ đi thẳng tới Xem lại — cùng điều kiện `autoContinue` của `requestPrefill`,
 * nhưng chỉ những ô MỞ ĐƯỢC trên thẻ đặt xe. `null` = đủ, hoặc thiếu thứ thẻ không có ô riêng (gói dài
 * hạn chưa niêm yết, điểm đến liên tỉnh) — khi đó luồng đặt xe tự hiện bước Chuyến đi như web.
 */
function missingTripInput(trip: ListingTripDraft): TripInputKind | null {
  if (trip.serviceType === SERVICE_TYPE.LONG_TERM) {
    if (trip.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && !trip.requestedPickupDate) {
      return 'date';
    }
    return trip.deliveryRequested && !trip.delivery ? 'delivery' : null;
  }
  if (!trip.pickupAt || !trip.returnAt) return 'range';
  if (trip.serviceType === SERVICE_TYPE.WITH_DRIVER) return trip.driverPickup ? null : 'driver';
  return trip.deliveryRequested && !trip.delivery ? 'delivery' : null;
}

function RequestBar({
  vehicleId,
  shopSlug,
  shopChatOpen,
  trip,
  provinceCode,
  onNeedInput,
}: {
  /** Thẻ còn thiếu một ô mở được trên trang ⇒ mở ô đó thay vì sang bước Chuyến đi. */
  onNeedInput: (kind: TripInputKind) => void;
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
  /*
    Hỏi cổng nhắn tin Ở ĐÂY chứ không để nút tự giấu mình: ô `f={1}` bọc ngoài vẫn giữ nửa bề
    ngang kể cả khi ruột nó rỗng, nên nút đặt xe sẽ không bao giờ nở ra hết hàng.
  */
  const canChat = useShopChatAvailable(shopSlug, shopChatOpen);
  return (
    // Khung (nền, vạch trên, đệm) do `Screen` vẽ cho `footer` — ở đây chỉ còn hàng nút; tự vẽ thêm
    // một lớp nữa là thành hai hộp lồng nhau.
    <YStack>
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
            onPress={() => {
              /*
               * Chuyến chưa đủ ⇒ mở NGAY ô còn thiếu trên trang xe (người dùng chốt 28/10/2026) —
               * không sang bước Chuyến đi của luồng đặt xe. Đủ thì đi thẳng tới Xem lại.
               */
              const missing = missingTripInput(trip);
              if (missing) onNeedInput(missing);
              else navigateOnce(ROUTES.booking.request(vehicleId, requestPrefill(trip, provinceCode)));
            }}
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
  inputRequest,
}: {
  listing: PublicListingDetail;
  trip: ListingTripDraft;
  onTripChange: (patch: Partial<ListingTripDraft>) => void;
  inputRequest: TripInputRequest | null;
}) {
  const colors = useColors();
  const { scheme } = useAppScheme();
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

  // Vùng cuộn + bàn phím do `Screen` giữ (vỏ màn) — ở đây chỉ còn nội dung.
  return (
    <YStack pb={layout.section}>
      <Gallery name={listing.name} mainImageUrl={listing.mainImageUrl} images={listing.images} />

      {/*
        Thứ tự khối = bản vẽ mobile v2 (Figma `19771:71482`) + nội dung của `ListingDetailView` web:
        tên · địa chỉ · thông số → lợi ích → thẻ đặt xe → mô tả → tiện ích → vị trí → chủ xe →
        Quy định & Chính sách → đánh giá.
      */}
      {/*
        Khối cách khối 16, tiêu đề khối cách nội dung 8 — web ≤640px (`.layout { gap: lg }` ở thang
        mật độ mobile, nơi `lg` = 16). Phẳng, không còn tấm nền bo góc đè lên ảnh: ảnh đã thụt lề.
      */}
      <YStack px={layout.screenX} pt={space.md} gap={space.md}>
        <YStack gap={space.sm}>
          <XStack ai="flex-start" gap={ACTION_GAP}>
            <XStack f={1} ai="center" gap={space.sm} rowGap={space.xs} flexWrap="wrap">
              {/* Figma `19771:72411`: 24 Semibold, giữ hoa/thường như dữ liệu. */}
              <Text col={colors.text} fos={fontSize.lead} fow={fontWeight.semibold}>
                {listing.name}
              </Text>
              {isNewVehicle ? <Badge tone="success" label={tCard('newVehicle')} /> : null}
              {listing.vatInvoiceSupported ? <Badge label={t('vatInvoice.badge')} /> : null}
            </XStack>
            {/* Vùng Chia sẻ & Yêu thích — cụm `.actionIcons` của `ListingHeaderActions` web ≤640px: gap space-12. */}
            <XStack gap={ACTION_GAP}>
              <Pressable
                onPress={share}
                accessibilityRole="button"
                accessibilityLabel={t('share.label')}
                hitSlop={(sizing.touchTarget - ACTION_DISC) / 2}
              >
                {/* `.actionBtn` web ≤640px: đĩa 32, nền `bg-container`, viền `border` 1px, icon 16 `text-secondary`. */}
                <YStack
                  w={ACTION_DISC}
                  h={ACTION_DISC}
                  br={radius.pill}
                  ai="center"
                  jc="center"
                  bw={1}
                  bc={colors.border}
                  bg={colors.surface}
                >
                  <Ionicons name="share-social-outline" size={iconSize.sm} color={colors.textMuted} />
                </YStack>
              </Pressable>
              <FavoriteButton vehicleId={listing.id} vehicleName={listing.name} variant="action" />
            </XStack>
          </XStack>

          {locationLine ? (
            // `.locationRow` web ≤640px: ghim 20 `text-tertiary`, chữ 16/24 `text-secondary`, khe 8.
            <XStack ai="flex-start" gap={space.sm}>
              <YStack pt={1}>
                <Ionicons name="location-outline" size={18} color={colors.placeholder} />
              </YStack>
              <Text f={1} col={colors.textMuted} fos={BODY_TEXT}>
                {locationLine}
              </Text>
            </XStack>
          ) : null}

          {specs.length > 0 ? (
            /* Web `ListingSpecsCard` (Figma `19771:72494`) ở ≤640px: lưới 2 × 2, hàng cách 16; vòng
               icon 48 nền `primary-subtle` (tối: `primary-light`), icon 24 vàng; nhãn 14
               `text-tertiary`, giá trị 16 Medium `text-secondary`. */
            <XStack flexWrap="wrap" rowGap={space.md} pt={space.md}>
              {specs.map((spec) => (
                <XStack key={spec.key} w="50%" ai="center" gap={space.sm + space.xs}>
                  <YStack
                    w={40}
                    h={40}
                    br={radius.pill}
                    ai="center"
                    jc="center"
                    bg={scheme === 'dark' ? colors.primaryLight : colors.primarySubtle}
                  >
                    <Ionicons name={spec.icon} size={20} color={colors.primary} />
                  </YStack>
                  <YStack f={1} minWidth={0} gap={2}>
                    <Text col={colors.placeholder} fos={fontSize.bodySm} numberOfLines={1}>
                      {spec.label}
                    </Text>
                    <Text col={colors.textMuted} fos={BODY_TEXT} fow={fontWeight.medium} numberOfLines={1}>
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
          openRequest={inputRequest}
          priceSlot={
            <PriceBlock
              activeService={activeService as ServiceType}
              listing={listing}
              discount={discount}
              packageMonths={trip.packageMonths}
            />
          }
        />

        <YStack gap={space.sm}>
          <MarketSectionTitle>{t('description')}</MarketSectionTitle>
          {/* Hãng + màu đầu khối mô tả (Figma `19771:72580`): một hàng, khe 8 × 40, chữ 16. */}
          {descriptionAttributes.length > 0 ? (
            <XStack flexWrap="wrap" columnGap={40} rowGap={space.sm}>
              {descriptionAttributes.map((attr) => (
                <XStack key={attr.key} ai="center" gap={space.sm}>
                  <Ionicons
                    name={attr.key === 'brand' ? 'car-outline' : 'color-palette-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                  <Text col={colors.textMuted} fos={BODY_TEXT}>
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
            </XStack>
          ) : null}
          {/* `.descBody` web ≤640px: 16/24, căn đều hai lề. */}
          <Text
            col={colors.textMuted}
            fos={BODY_TEXT}
            textAlign="justify"
            {...(descriptionOpen ? {} : { numberOfLines: 4 })}
          >
            {listing.description || t('descriptionEmpty')}
          </Text>
          {listing.description && listing.description.length > DESCRIPTION_CLAMP_CHARS ? (
            <Pressable
              onPress={() => setDescriptionOpen((v) => !v)}
              accessibilityRole="button"
              hitSlop={space.sm}
            >
              <XStack ai="center" gap={space.xs}>
                <Text col={colors.primary} fos={BODY_TEXT} fow={fontWeight.semibold}>
                  {descriptionOpen ? t('descriptionToggle.less') : t('descriptionToggle.more')}
                </Text>
                <Ionicons
                  name={descriptionOpen ? 'chevron-up' : 'chevron-down'}
                  size={iconSize.sm}
                  color={colors.primary}
                />
              </XStack>
            </Pressable>
          ) : null}
        </YStack>

        {listing.features.length > 0 ? (
          <YStack gap={space.sm}>
            <MarketSectionTitle>{t('featuresTitle')}</MarketSectionTitle>
            {/* Lưới 2 cột, khe 12 (Figma `19771:72667`). */}
            <XStack flexWrap="wrap" rowGap={12}>
              {listing.features.map((key) => (
                <YStack key={key} style={HALF_CELL}>
                  <FeatureItem
                    featureKey={key}
                    label={catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) ?? key}
                  />
                </YStack>
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
          <MarketSectionTitle>{t('hostTitle')}</MarketSectionTitle>
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
    </YStack>
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
          <Text col={colors.textDisabled} fos={BODY_TEXT} textDecorationLine="line-through">
            {fmt.moneyCompact(listedPrice, { price: true })}
          </Text>
        ) : null}
        {/* Giá niêm yết RÚT GỌN ("1.050k") như thẻ đặt xe web #222 — mọi khoản của chuyến bên dưới vẫn đủ số. */}
        <PriceRow amount={fmt.moneyCompact(shownPrice, { price: true })} unit={unit} />
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
      {/* `.mainPrice` web: h2 24 Semibold `primary`; đơn vị 16 `text-tertiary` (≤640px). */}
      <Text col={colors.primary} fos={fontSize.h3} fow={fontWeight.semibold}>
        {amount}
      </Text>
      <Text col={colors.placeholder} fos={BODY_TEXT}>
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
  // Ảnh THỤT trong lề trang (web ≤640px `.slide`, Figma `19771:72122`): rộng = bề ngang nội dung.
  const slideWidth = width - layout.screenX * 2;
  const height = slideWidth / PHOTO_RATIO;
  // Mỗi trang cuộn = một ảnh + khe giữa hai ảnh.
  const step = slideWidth + SLIDE_GAP;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setActive(Math.round(event.nativeEvent.contentOffset.x / Math.max(step, 1)));
    },
    [step],
  );

  const jumpTo = useCallback(
    (index: number) => {
      setActive(index);
      pagerRef.current?.scrollTo({ x: index * step, animated: true });
    },
    [step],
  );

  if (unique.length === 0) {
    return (
      <YStack px={layout.screenX} py={12}>
        <YStack h={height} br={radius.control} bg={colors.surfaceMuted} ai="center" jc="center">
          <Ionicons name="car-sport-outline" size={48} color={colors.border} />
        </YStack>
      </YStack>
    );
  }

  return (
    // `.wrap` ≤640px: đệm 12 trên/dưới; dải ảnh nhỏ cách ảnh 8.
    <YStack py={12} gap={space.sm}>
      <YStack>
        <ScrollView
          ref={pagerRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ paddingHorizontal: layout.screenX, gap: SLIDE_GAP }}
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
                style={{ width: slideWidth, height, borderRadius: radius.control }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={url}
                transition={150}
              />
            </Pressable>
          ))}
        </ScrollView>

        {/*
          Bộ đếm "n/N" nổi góc dưới-phải ảnh — `.counter` web ≤640px: nền đen 55% CỐ ĐỊNH (nó nằm
          trên ảnh, không trên nền trang), chữ `text-on-dark` 12.
        */}
        {unique.length > 1 ? (
          <XStack
            pos="absolute"
            bottom={space.sm}
            right={layout.screenX + space.sm}
            bg={market.photoScrim}
            br={radius.pill}
            px={space.sm}
            py={2}
          >
            <Text col={market.onDark} fos={fontSize.bodySm}>
              {active + 1}/{unique.length}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      {unique.length > 1 ? (
        <ListingGalleryThumbs urls={unique} active={active} onSelect={jumpTo} />
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
  const { width } = useWindowDimensions();

  return (
    <YStack gap={space.sm}>
      {/*
        Figma `19771:72800`: "Đánh giá" + ★ điểm (số lượt) cùng hàng. Web không có trang "Xem tất cả"
        cho đánh giá của MỘT xe, nên không vẽ nút dẫn vào hư không.
      */}
      <MarketSectionTitle
        action={
          hasReviews ? (
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="star" size={20} color={STAR_ART} />
              <Text col={colors.text} fos={BODY_TEXT} fow={fontWeight.semibold}>
                {fmt.rating(data!.summary.ratingAvg)}
              </Text>
              <Text col={colors.placeholder} fos={BODY_TEXT}>
                {`(${data!.summary.ratingCount})`}
              </Text>
            </XStack>
          ) : undefined
        }
      >
        {t('title')}
      </MarketSectionTitle>

      {!hasReviews ? (
        <Text col={colors.textMuted} fos={BODY_TEXT}>
          {t('empty')}
        </Text>
      ) : (
        // Mỗi lần vuốt một đánh giá, trọn bề ngang nội dung, chấm phân trang bên dưới (Figma).
        <HomeCarousel
          accessibilityLabel={t('title')}
          itemWidth={width - layout.screenX * 2}
        >
          {data!.data.map((review) => (
            <Card key={review.id} seamless>
              <YStack gap={12}>
                <XStack ai="center" gap={12}>
                  <Avatar name={review.customerName} size={32} />
                  <YStack f={1} minWidth={0}>
                    <Text
                      col={colors.text}
                      fos={BODY_TEXT}
                      fow={fontWeight.semibold}
                      numberOfLines={1}
                    >
                      {review.customerName}
                    </Text>
                    <Text col={colors.placeholder} fos={BODY_TEXT}>
                      {fmt.date(review.createdAt)}
                    </Text>
                  </YStack>
                  <Stars value={review.rating} size={20} />
                </XStack>
                {review.comment ? (
                  <Text col={colors.textMuted} fos={BODY_TEXT}>
                    {review.comment}
                  </Text>
                ) : null}
              </YStack>
            </Card>
          ))}
        </HomeCarousel>
      )}
    </YStack>
  );
}

/**
 * Khối VỊ TRÍ XE — bản ≤640px của web (Figma `19771:72668`): tiêu đề + "Mở bản đồ" cùng hàng, rồi
 * địa chỉ có ghim, rồi ẢNH BẢN ĐỒ TĨNH của điểm nhận xe (`StaticMapImage` web — người dùng chốt 28/10/2026
 * cho app có bản đồ như web). Chạm ảnh hay "Mở bản đồ" đều sang ứng dụng bản đồ của máy.
 *
 * Thiếu toạ độ thì không có liên kết; địa chỉ chữ vẫn ở lại.
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

  return (
    <YStack gap={space.sm}>
      <MarketSectionTitle
        action={
          geo ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(mapExternalUrl(geo))}
              hitSlop={space.sm}
            >
              {/* `.openMapLink` ≤640px: icon 20 + chữ 16 Semibold `color-primary`, khe 8. */}
              <XStack ai="center" gap={space.sm}>
                <Ionicons name="map-outline" size={20} color={colors.primary} />
                <Text col={colors.primary} fos={BODY_TEXT} fow={fontWeight.semibold}>
                  {t('location.openMap')}
                </Text>
              </XStack>
            </Pressable>
          ) : undefined
        }
      >
        {t('location.title')}
      </MarketSectionTitle>
      <XStack ai="flex-start" gap={space.sm}>
        <YStack pt={1}>
                <Ionicons name="location-outline" size={18} color={colors.placeholder} />
              </YStack>
        <Text f={1} col={colors.textMuted} fos={BODY_TEXT}>
          {[point.branchName, point.address, point.provinceName]
            .filter(Boolean)
            .join(LIST_SEPARATOR)}
        </Text>
      </XStack>
      {geo ? (
        <MapPreview
          uri={pickupMapUri(listingId, geo, point.address)}
          accessibilityLabel={t('location.title')}
          busyLabel={tStates('loading')}
          onOpen={() => void Linking.openURL(mapExternalUrl(geo))}
          openLabel={t('location.openMap')}
        />
      ) : null}
    </YStack>
  );
}

/**
 * Nhãn cạnh tên xe — `.badgeNew` / `.amenityBadge` của web: đệm 2 × 8, bo `card` (16), chữ 12
 * Medium. "Xe mới" nền `success-bg` chữ `success`; nhãn tiện ích nền `primary-subtle` chữ
 * `primary-hover`.
 */
function Badge({ label, tone = 'brand' }: { label: string; tone?: 'brand' | 'success' }) {
  const colors = useColors();
  const success = tone === 'success';
  return (
    <XStack
      bg={success ? colors.successSurface : colors.primarySubtle}
      bw={1}
      bc={success ? colors.successBorder : colors.primaryLight}
      br={radius.card}
      px={space.sm}
      py={2}
    >
      <Text
        col={success ? colors.success : colors.primaryHover}
        fos={fontSize.bodySm}
        fow={fontWeight.medium}
      >
        {label}
      </Text>
    </XStack>
  );
}
