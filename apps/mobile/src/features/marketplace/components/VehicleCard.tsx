import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, VEHICLE_TYPE_LABEL, type VehicleType } from '@xeprime/types';
import { applyDiscountPercent } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { DetailArrow } from '@/components/ui/DetailArrow';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { VerifiedName } from '@/components/ui/VerifiedName';
import type { IconName } from '@/components/ui/Chip';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useSearchFilters } from '../search-context';
import type { PublicListing } from '../api';

/** Ảnh 16:10 — đủ cao để nhận ra chiếc xe, đủ thấp để thẻ sau lộ ra ở cuối màn. */
const PHOTO_RATIO = 16 / 10;

/** Đích chạm gian hàng chỉ chiếm phần chữ, không kéo sang cột giá bên phải. */
const styles = StyleSheet.create({ shopLink: { flex: 1 } });

/**
 * Cỡ avatar chủ xe trên thẻ — MỘT con số cho cả hai tuyến.
 *
 * `Avatar` vẽ vòng nhấn vào bên trong đường kính này, nên thẻ của gian hàng và thẻ của chủ xe cá
 * nhân có hàng chân cao bằng nhau và ảnh thẳng cột khi cuộn.
 */
const SHOP_AVATAR = 34;

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
  const t = useTranslations('Listings.card');
  const domainLabel = useDomainLabel();
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
  // Thẻ xe lưu KEY hãng/nhiên liệu — nhãn tra từ danh mục chung với web, không dịch tại chỗ.
  const { brandLabel, fuelTypeLabel } = useCatalogLabels();

  const typeLabel = domainLabel(
    'vehicleType',
    listing.vehicleType,
    VEHICLE_TYPE_LABEL[listing.vehicleType as VehicleType] ?? listing.vehicleType,
  );
  const specs = [brandLabel(listing.brand), listing.model].filter(Boolean).join(' ') || typeLabel;

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
  const hasRating = (listing.ratingCount ?? 0) > 0 && Number.isFinite(rating);
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

  const open = onPress ? () => onPress(listing, activeService) : undefined;

  return (
    <Card
      padded={false}
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
          Mũi tên GIỮ NGUYÊN chỗ cũ: đè lên ảnh, góc trên-phải. `inset` DƯƠNG vì ảnh không có
          đệm — lề âm mặc định (dành cho khối chữ đã đệm) sẽ đẩy glyph ra ngoài mép ảnh.
          Hình dạng thì lấy chuẩn ở thẻ chuyến: glyph trần, không đĩa nền.
        */}
        {open ? (
          <DetailArrow
            label={t('viewDetail', { name: listing.name })}
            onPress={open}
            inset={space.sm}
          />
        ) : null}

        <XStack pos="absolute" top={space.sm} left={space.sm} gap={space.xs}>
          {discount > 0 ? (
            <XStack bg={colors.discount} br={radius.sm} px={space.sm} py={2}>
              <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
                -{discount}%
              </Text>
            </XStack>
          ) : null}
          {listing.deliveryEnabled ? <Badge label={t('delivery')} /> : null}
          {listing.noCollateral ? <Badge label={t('noCollateral')} /> : null}
        </XStack>
      </YStack>

      <YStack p={space.md} gap={space.sm}>
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} numberOfLines={1}>
            {listing.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {specs}
          </Text>
        </YStack>

        <XStack gap={space.md} rowGap={space.md} flexWrap="wrap">
          {listing.shopProvince ? (
            <Meta icon="location-outline" value={listing.shopProvince} />
          ) : null}
          {fuel ? <Meta icon="water-outline" value={fuel} /> : null}
          {listing.seatCount ? (
            <Meta icon="people-outline" value={t('seats', { count: listing.seatCount })} />
          ) : null}
        </XStack>

        <XStack ai="center" gap={space.xs}>
          {hasRating ? (
            <>
              <Ionicons name="star" size={iconSize.xs} color={colors.primary} />
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {fmt.rating(rating)}
              </Text>
            </>
          ) : (
            <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('newVehicle')}
            </Text>
          )}
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            ·
          </Text>
          {/* Xanh lá là màu web dành riêng cho số chuyến đã hoàn thành (`.tripCount .anticon`) —
              nó nói "đã chạy thật", tách khỏi sao vàng của điểm đánh giá. */}
          <Ionicons name="stats-chart" size={12} color={colors.success} />
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('completedTrips', { count: listing.completedTripCount ?? 0 })}
          </Text>
        </XStack>

        <YStack h={1} bg={colors.borderSubtle} />

        <XStack ai="center" jc="space-between" gap={space.sm}>
          {/*
            Hàng gian hàng là một đích chạm RIÊNG, lồng trong thẻ — đúng như web lồng một
            `<Link>` sang `/shops/[slug]` ở chính chỗ này.

            `py` nâng chiều cao vùng chạm: hàng chữ chỉ cao 30dp, mà một đích chạm nằm lọt
            trong một đích chạm khác thì thiếu vài dp là bấm trượt sang trang xe.
          */}
          <Pressable
            onPress={() => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug))}
            accessibilityRole="button"
            /*
              `accessibilityLabel` THAY THẾ mọi chữ bên trong khi trình đọc màn hình đọc nó — nên
              nhãn của dấu xác minh bên dưới sẽ không bao giờ tới tai người dùng nếu nhãn này chỉ
              có mỗi tên. Ghép ở tầng BẢN DỊCH, không nối chuỗi: dấu nối và thứ tự hai vế là quyết
              định của từng ngôn ngữ.
            */
            accessibilityLabel={
              isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
            }
            style={styles.shopLink}
          >
            <XStack ai="center" gap={space.xs} py={space.xs}>
              <Avatar
                name={listing.shopName}
                url={listing.shopLogoUrl}
                size={SHOP_AVATAR}
                verifiedLabel={isShopTrack ? t('shopVerified') : undefined}
              />
              <YStack f={1} gap={0}>
                {/*
                  Chữ "Gian hàng" đậm lên nhưng giữ màu CHỮ THƯỜNG: gold đã dồn hết vào tên bên
                  dưới và con dấu: tô vàng cả hai dòng thì không dòng nào nổi, và một nhãn 11px màu
                  gold trên nền trắng là dòng tuột ngưỡng tương phản đầu tiên của cả thẻ.
                  Chủ xe cá nhân giữ nguyên xám nhạt — nhấn CẢ HAI là không nhấn gì.
                */}
                <Text
                  col={isShopTrack ? colors.text : colors.placeholder}
                  fos={fontSize.label}
                  fow={isShopTrack ? fontWeight.semibold : fontWeight.regular}
                >
                  {t(isShopTrack ? 'shop' : 'owner')}
                </Text>
                {/*
                  TÊN GIAN HÀNG tô GOLD trên thẻ chợ — khác định dạng nhận diện ở khu tài khoản,
                  và cố ý.

                  Ở khu tài khoản, khối nhận diện có cả một dải nền gold và một cái ảnh 96dp để
                  nói "đã xác thực", nên cái tên được phép giữ màu chữ thường. Trên thẻ chợ thì
                  hàng này cao 34dp, nằm cuối một thẻ đã đầy chữ, và nó phải cạnh tranh với con số
                  giá ngay bên phải — gold là thứ kéo mắt sang đúng chỗ khách cần phân biệt: xe
                  của gian hàng hay xe của một chủ xe cá nhân.

                  `primaryActive` chứ không `primary`: gold nhấn của sản phẩm là màu của MẢNG và
                  của hình; chữ 12px trên nền trắng cần bậc đậm hơn mới đạt ngưỡng tương phản.
                */}
                <VerifiedName
                  name={listing.shopName}
                  verifiedLabel={isShopTrack ? t('shopVerified') : undefined}
                  color={isShopTrack ? colors.primaryActive : colors.text}
                  weight={isShopTrack ? fontWeight.bold : fontWeight.semibold}
                  markSize={15}
                  decorativeMark
                />
              </YStack>
            </XStack>
          </Pressable>

          <YStack ai="flex-end">
            {selfDrive && discount > 0 && listing.weekdayPrice ? (
              <Text col={colors.placeholder} fos={fontSize.label} textDecorationLine="line-through">
                {compactPrice(listing.weekdayPrice)}
              </Text>
            ) : null}

            {displayPrice ? (
              <XStack ai="baseline" gap={2}>
                <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                  {compactPrice(displayPrice)}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
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

function Meta({ icon, value }: { icon: IconName; value: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={iconSize.xs} color={colors.textMuted} />
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {value}
      </Text>
    </XStack>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <XStack bg={colors.surface} br={radius.sm} px={space.sm} py={2}>
      <Text col={colors.text} fos={fontSize.label} fow={fontWeight.medium}>
        {label}
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
export const VehicleCard = memo(VehicleCardImpl);
