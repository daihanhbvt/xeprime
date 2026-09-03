import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  Image,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  COLLATERAL_ASSET_TYPE_LABEL,
  COLLATERAL_MODE,
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  requiredIdentityDocuments,
  SERVICE_TYPE,
  type ServiceType,
} from '@xeprime/types';
import { applyDiscountPercent } from '@xeprime/domain';
import { catalogLabel } from '@xeprime/api-client';
import { useRouter } from 'expo-router';
import { AppHeader } from '@/components/layout/AppHeader';
import { ScreenError } from '@/components/state/ScreenError';
import { ListingDetailSkeleton } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Stars } from '@/components/ui/Stars';
import type { IconName } from '@/components/ui/Chip';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { ROUTES } from '@/navigation/routes';
import { useListing, useListingReviews } from './hooks/use-marketplace-data';
import type { PublicListingDetail } from './api';
import { FeatureChip } from './components/FeatureChip';
import { ServiceSelector } from './components/ServiceSelector';

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

/** Biểu tượng cho từng dòng thông số — nhận ra bằng mắt nhanh hơn đọc nhãn. */
const SPEC_ICON: Record<string, IconName> = {
  vehicleType: 'car-outline',
  bodyType: 'cube-outline',
  seatCount: 'people-outline',
  fuelType: 'water-outline',
  manufactureYear: 'calendar-outline',
  color: 'color-palette-outline',
  brand: 'pricetag-outline',
};

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
  const listing = useListing(vehicleId);
  const [scrolled, setScrolled] = useState(false);
  /*
   * Dịch vụ đang chọn sống ở VỎ, không trong `DetailBody`: thanh CTA đáy màn nằm ngoài vùng
   * cuộn nên nó không đọc được state bên trong, mà nó phải mở wizard đúng loại khách vừa xem giá.
   *
   * `null` = chưa có dữ liệu xe nên chưa suy được mặc định; lúc đó chưa render thanh CTA.
   */
  const [chosenService, setChosenService] = useState<string | null>(null);

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
        activeService={
          chosenService ?? defaultServiceOf(listing.data.serviceTypes ?? [], initialServiceType)
        }
        onScroll={onScroll}
        onServiceChange={setChosenService}
      />

      {/*
        Thanh hành động DÍNH ĐÁY — lối duy nhất vào luồng gửi yêu cầu thuê.
        
        Web đặt nút trong cột phải luôn nhìn thấy; native không có cột phải, nên nút phải nổi
        trên nội dung. Không có nó thì khách phải cuộn hết trang mới thấy cách đặt xe.
      */}
      <RequestBar
        vehicleId={listing.data.id}
        serviceType={
          chosenService ?? defaultServiceOf(listing.data.serviceTypes ?? [], initialServiceType)
        }
      />
    </YStack>
  );
}

/**
 * Thanh CTA đáy màn chi tiết xe.
 *
 * Mang theo dịch vụ đang chọn để wizard mở ra đúng loại khách vừa xem giá — mở mặc định "tự
 * lái" sau khi khách vừa xem giá "có tài xế" là bắt họ chọn lại thứ đã chọn.
 */
function RequestBar({ vehicleId, serviceType }: { vehicleId: string; serviceType?: string }) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <YStack
      px={layout.screenX}
      pt={space.sm}
      pb={insets.bottom + space.sm}
      bg={colors.surface}
      borderTopWidth={1}
      borderColor={colors.borderSubtle}
      style={elevation.raised}
    >
      <Button
        label={t('cta')}
        size="lg"
        onPress={() => router.push(ROUTES.booking.request(vehicleId, serviceType))}
      />
    </YStack>
  );
}

function DetailBody({
  listing,
  activeService,
  onScroll,
  onServiceChange,
}: {
  listing: PublicListingDetail;
  /** Dịch vụ đang chọn — do VỎ giữ, vì thanh CTA đáy nằm ngoài vùng cuộn này. */
  activeService: string;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onServiceChange: (serviceType: string) => void;
}) {
  const t = useTranslations('Listings.detail');
  const tCard = useTranslations('Listings.card');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { catalog } = useCatalog();
  const insets = useSafeAreaInsets();

  const services: readonly string[] = listing.serviceTypes ?? [];

  // Preview cùng công thức với PricingService; báo giá server vẫn là nguồn chốt.
  const discount = listing.discountPercent ?? 0;
  const displayPrice =
    discount > 0 ? applyDiscountPercent(listing.weekdayPrice, discount) : listing.weekdayPrice;

  const brand = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand);
  const rating = Number(listing.ratingAvg);
  const hasRating = listing.ratingCount > 0 && Number.isFinite(rating);

  const specs: { key: string; label: string; value: string }[] = [
    {
      key: 'vehicleType',
      label: t('specs.vehicleType'),
      value: domainLabel('vehicleType', listing.vehicleType),
    },
    ...(listing.bodyType
      ? [
          {
            key: 'bodyType',
            label: t('specs.bodyType'),
            value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '',
          },
        ]
      : []),
    ...(listing.seatCount
      ? [
          {
            key: 'seatCount',
            label: t('specs.seats'),
            value: tCard('seats', { count: listing.seatCount }),
          },
        ]
      : []),
    ...(listing.fuelType
      ? [
          {
            key: 'fuelType',
            label: t('specs.fuelType'),
            value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '',
          },
        ]
      : []),
    ...(listing.manufactureYear
      ? [{ key: 'manufactureYear', label: t('specs.year'), value: String(listing.manufactureYear) }]
      : []),
    ...(listing.color ? [{ key: 'color', label: t('specs.color'), value: listing.color }] : []),
    ...(brand
      ? [
          {
            key: 'brand',
            label: t('specs.brand'),
            value: [brand, listing.model].filter(Boolean).join(' '),
          },
        ]
      : []),
  ];

  return (
    <ScrollView
      // Màn tràn viền nên không có SafeAreaView bọc ngoài: lề đáy phải tự cộng inset, nếu
      // không khối cuối bị thanh điều hướng Android che mất.
      contentContainerStyle={{ paddingBottom: layout.section + insets.bottom }}
      onScroll={onScroll}
      scrollEventThrottle={scrollThrottle.half}
    >
      <Gallery name={listing.name} mainImageUrl={listing.mainImageUrl} images={listing.images} />

      {/* Thân trang ĐÈ lên mép dưới ảnh, bo góc trên — cùng ngôn ngữ với thẻ tìm kiếm trang chủ. */}
      <YStack
        bg={colors.background}
        borderTopLeftRadius={radius.lg}
        borderTopRightRadius={radius.lg}
        marginTop={-layout.heroOverlap}
        px={layout.screenX}
        pt={layout.section}
        gap={layout.section}
      >
        <YStack gap={layout.block}>
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold}>
              {listing.name}
            </Text>

            <XStack ai="center" gap={space.sm} rowGap={space.sm} flexWrap="wrap">
              {hasRating ? (
                <XStack ai="center" gap={space.xs}>
                  <Ionicons name="star" size={iconSize.xs} color={colors.primaryActive} />
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {fmt.rating(rating)}
                  </Text>
                </XStack>
              ) : (
                <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {tCard('newVehicle')}
                </Text>
              )}
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                ·
              </Text>
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="stats-chart" size={12} color={colors.success} />
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {tCard('completedTrips', { count: listing.completedTripCount ?? 0 })}
                </Text>
              </XStack>
              {listing.shopProvince ? (
                <>
                  <Text col={colors.placeholder} fos={fontSize.bodySm}>
                    ·
                  </Text>
                  <XStack ai="center" gap={space.xs}>
                    <Ionicons name="location-outline" size={iconSize.xs} color={colors.textMuted} />
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {listing.shopProvince}
                    </Text>
                  </XStack>
                </>
              ) : null}
            </XStack>
          </YStack>

          {/* Xe nhiều dịch vụ → selector ngay trên khối giá; giá lớn đổi theo. */}
          {services.length > 0 ? (
            <YStack gap={space.sm} accessibilityLabel={t('serviceSelector')}>
              <SectionLabel>{t('serviceLabel')}</SectionLabel>
              <ServiceSelector
                services={services}
                active={activeService}
                onChange={onServiceChange}
              />
            </YStack>
          ) : null}

          {/*
            Giá để PHẲNG, không bọc thẻ nền gold — web cũng vậy. Bọc thẻ thì con số to nhất
            trang lại nằm trong một mảng màu, và mắt đọc mảng màu trước con số.
          */}
          <YStack gap={space.sm}>
            <PriceBlock
              activeService={activeService as ServiceType}
              listing={listing}
              discount={discount}
              displayPrice={displayPrice}
            />

            {listing.deliveryEnabled || listing.noCollateral ? (
              <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
                {listing.deliveryEnabled ? <Badge label={t('delivery')} /> : null}
                {listing.noCollateral ? <Badge label={t('noCollateral')} /> : null}
              </XStack>
            ) : null}
          </YStack>
        </YStack>

        {/*
          Điều kiện bảo đảm + giấy tờ phải mang theo — khách cần biết TRƯỚC khi gửi yêu cầu,
          không phải lúc đến quầy mới biết mình thiếu cà vẹt. Chưa cấu hình thì im lặng còn hơn
          hứa sai.
        */}
        {listing.collateral ? (
          <Card lift="flat">
            <YStack gap={space.sm}>
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="document-text-outline" size={17} color={colors.primaryActive} />
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('collateralTitle')}
                </Text>
              </XStack>

              <YStack gap={space.xs}>
                <BulletLine
                  text={
                    listing.collateral.mode === COLLATERAL_MODE.CASH
                      ? t('collateralDeposit', {
                          amount: fmt.money(listing.collateral.depositAmount),
                        })
                      : listing.collateral.mode === COLLATERAL_MODE.ASSET
                        ? t('collateralAsset', {
                            types: listing.collateral.assetTypes
                              .map((type) =>
                                domainLabel(
                                  'collateralAssetType',
                                  type,
                                  COLLATERAL_ASSET_TYPE_LABEL[type],
                                ),
                              )
                              .join(', '),
                          })
                        : t('collateralNone')
                  }
                />
                <BulletLine
                  text={t('collateralDocuments', {
                    documents: requiredIdentityDocuments(activeService as ServiceType)
                      .map((doc) =>
                        domainLabel('customerDocumentType', doc, CUSTOMER_DOCUMENT_TYPE_LABEL[doc]),
                      )
                      .join(', '),
                  })}
                />
              </YStack>
            </YStack>
          </Card>
        ) : null}

        <Card lift="flat" padded={false}>
          <YStack>
            {specs.map((spec, index) => (
              <XStack
                key={spec.key}
                ai="center"
                gap={space.sm}
                px={space.md}
                py={space.sm}
                borderTopWidth={index === 0 ? 0 : 1}
                bc={colors.borderSubtle}
              >
                <Ionicons
                  name={SPEC_ICON[spec.key] ?? 'ellipse-outline'}
                  size={iconSize.sm}
                  color={colors.textMuted}
                />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                  {spec.label}
                </Text>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {spec.value}
                </Text>
              </XStack>
            ))}
          </YStack>
        </Card>

        {listing.features.length > 0 ? (
          <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
            {listing.features.map((key) => (
              <FeatureChip
                key={key}
                featureKey={key}
                label={catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) ?? key}
              />
            ))}
          </XStack>
        ) : null}

        <Card lift="flat">
          <XStack ai="center" gap={space.md}>
            <Avatar name={listing.shopName} url={listing.shopLogoUrl} size={44} />
            <YStack f={1} gap={2}>
              <XStack ai="center" gap={space.xs}>
                <Text
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {listing.shopName}
                </Text>
                {/* Xe lên chợ đồng nghĩa gian hàng đã qua duyệt nền tảng — tick nói đúng điều đó. */}
                <Ionicons
                  name="checkmark-circle"
                  size={15}
                  color={colors.primary}
                  accessibilityLabel={t('shopVerified')}
                />
              </XStack>
              {listing.shopProvince ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {listing.shopProvince}
                </Text>
              ) : null}
              {listing.shopBio ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {listing.shopBio}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        </Card>

        <Card lift="flat">
          <YStack gap={space.xs}>
            <SectionTitle icon="reader-outline">{t('description')}</SectionTitle>
            <Body>{listing.description || t('descriptionEmpty')}</Body>
          </YStack>
        </Card>

        <Reviews vehicleId={listing.id} />

        {/*
          Điểm nhận xe: địa chỉ là thông tin CHÍNH, web còn nhúng thêm bản đồ minh hoạ. Native
          chưa nhúng bản đồ — đó cần một thư viện map riêng (ADR 0018 để provider trung lập), và
          phần chữ đã đủ để khách biết đến đâu lấy xe.
        */}
        {listing.pickupPoint ? (
          <Card lift="flat">
            <YStack gap={space.xs}>
              <SectionTitle icon="navigate-outline">{t('pickupPoint.title')}</SectionTitle>
              <Body>
                {[listing.pickupPoint.branchName, listing.pickupPoint.address]
                  .filter(Boolean)
                  .join(' · ')}
              </Body>
              {listing.pickupPoint.provinceName ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {listing.pickupPoint.provinceName}
                </Text>
              ) : null}
            </YStack>
          </Card>
        ) : null}
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
  displayPrice,
}: {
  activeService: ServiceType;
  listing: PublicListingDetail;
  discount: number;
  displayPrice: string | null | undefined;
}) {
  const t = useTranslations('Listings.detail');
  const tCard = useTranslations('Listings.card');
  const fmt = useAppFormat();

  if (activeService === SERVICE_TYPE.LONG_TERM) {
    return listing.monthlyPrice ? (
      <PriceRow amount={fmt.money(listing.monthlyPrice)} unit={tCard('perMonthUnit')} />
    ) : (
      <QuoteLine text={t('longTermQuote')} />
    );
  }

  if (activeService === SERVICE_TYPE.WITH_DRIVER) {
    return listing.withDriverDailyPrice ? (
      <PriceRow amount={fmt.money(listing.withDriverDailyPrice)} unit={tCard('perDayUnit')} />
    ) : (
      <QuoteLine text={t('withDriverQuote')} />
    );
  }

  // Giá cũ, nhãn giảm và giá mới nằm CÙNG một hàng canh chân chữ — như web. Tách giá cũ lên
  // dòng riêng làm nó đọc như một con số độc lập chứ không phải mức trước khi giảm.
  return (
    <XStack ai="baseline" gap={space.sm} rowGap={space.sm} flexWrap="wrap">
      {discount > 0 && listing.weekdayPrice ? (
        <>
          <Text col={colors.placeholder} fos={fontSize.body} textDecorationLine="line-through">
            {fmt.money(listing.weekdayPrice)}
          </Text>
          <XStack bg={colors.discount} br={radius.sm} px={space.sm} py={2}>
            <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
              -{discount}%
            </Text>
          </XStack>
        </>
      ) : null}
      <PriceRow amount={fmt.money(displayPrice)} unit={tCard('perDayUnit')} />
    </XStack>
  );
}

function PriceRow({ amount, unit }: { amount: string; unit: string }) {
  return (
    <XStack ai="baseline" gap={space.xs}>
      <Text col={colors.price} fos={fontSize.h1} fow={fontWeight.bold}>
        {amount}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {unit}
      </Text>
    </XStack>
  );
}

/** Dịch vụ chưa niêm yết giá — nói rõ phải liên hệ, không trưng giá của dịch vụ khác thay. */
function QuoteLine({ text }: { text: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.primaryActive} />
      <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
        {text}
      </Text>
    </XStack>
  );
}

/** Ảnh chính + thư viện, vuốt ngang có chỉ báo `1/5` — web dùng lưới thumbnail. */
function Gallery({
  name,
  mainImageUrl,
  images,
}: {
  name: string;
  mainImageUrl?: string | null;
  images: string[];
}) {
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);

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

  if (unique.length === 0) {
    return (
      <YStack w="100%" h={height} bg={colors.surfaceMuted} ai="center" jc="center">
        <Ionicons name="car-sport-outline" size={48} color={colors.border} />
      </YStack>
    );
  }

  return (
    <YStack>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
      >
        {unique.map((url) => (
          <Image
            key={url}
            source={{ uri: url }}
            style={{ width, height }}
            resizeMode="cover"
            accessibilityLabel={name}
          />
        ))}
      </ScrollView>

      {/* Lùi lên trên phần thân trang đè xuống, nếu không nó bị bo góc che mất. */}
      {unique.length > 1 ? (
        <XStack
          pos="absolute"
          bottom={space.lg}
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
  );
}

/** Đánh giá công khai. Tự ẩn khi lỗi hoặc chưa có — không kéo cả trang xuống màn lỗi. */
function Reviews({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Listings.reviews');
  const fmt = useAppFormat();
  const { data } = useListingReviews(vehicleId);

  const hasReviews = Boolean(data && data.summary.ratingCount > 0);

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

function SectionTitle({ icon, children }: { icon: IconName; children: string }) {
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

function SectionLabel({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
      {children.toLocaleUpperCase()}
    </Text>
  );
}

/**
 * Một dòng điều kiện. Biểu tượng nằm trong hộp cao ĐÚNG bằng một dòng chữ và canh giữa hộp đó —
 * đặt nó thẳng cạnh `Text` nhiều dòng thì nó dính lên đỉnh khối, lệch hẳn so với dòng đầu.
 */
function BulletLine({ text }: { text: string }) {
  const lineHeight = Math.round(fontSize.bodySm * 1.5);

  return (
    <XStack ai="flex-start" gap={space.xs}>
      <YStack h={lineHeight} jc="center">
        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
      </YStack>
      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} lineHeight={lineHeight}>
        {text}
      </Text>
    </XStack>
  );
}

/** Tiện ích nổi bật — viên gold nhạt viền mảnh, đúng `.amenityBadge` của web. */
function Badge({ label }: { label: string }) {
  return (
    <XStack
      bg={colors.primaryLight}
      bw={1}
      bc={colors.borderSubtle}
      br={radius.pill}
      px={space.md}
      py={space.xs}
    >
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {label}
      </Text>
    </XStack>
  );
}
