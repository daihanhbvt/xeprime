import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { applyDiscountPercent, LIST_SEPARATOR } from '@xeprime/domain';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { ShopQuickInfoCard } from '@/components/shop/ShopQuickInfoCard';
import { Card } from '@/components/ui/Card';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** `.compactMobile` — cột ảnh 112, tỉ lệ 4/3 (84), bo `border-radius`; khe `space-12` tới cột chữ. */
const VEHICLE_THUMB = { width: 112, height: 84 } as const;
const THUMB_GAP = toPx(XP_TOKENS['space-12']);

/**
 * Hồ sơ xe ở đầu luồng gửi yêu cầu — bản native của `VehicleSummaryPanel`.
 *
 * Cố ý KHÔNG dựng lại cả trang chi tiết xe (gallery, tiện ích, đánh giá): khách vừa xem xong
 * ngay trước khi bấm "Thuê xe này", và chúng đẩy phần nhập liệu thật xuống dưới.
 *
 * Giá phải là giá của DỊCH VỤ ĐANG ĐẶT: trưng giá và khuyến mãi tự lái trong lúc khách mua gói
 * dài hạn là hiển thị sai giá (ADR 0011).
 */
export function VehicleSummaryCard({
  listing,
  serviceType,
  packageMonths,
  showShop = true,
}: {
  listing: PublicListingDetail;
  serviceType: string;
  /** Gói dài hạn đang chọn — có gói thì hiện giá gói THẬT thay cho giá cơ sở /tháng. */
  packageMonths: number | null;
  /**
   * Thẻ gian hàng (điểm, số chuyến, "Xem gian hàng") — `false` ở luồng đặt hộ: người đang đặt CHÍNH
   * LÀ gian hàng đó (web `showShop={false}`).
   */
  showShop?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;

  // `discountPercent` là khuyến mãi của riêng dịch vụ TỰ LÁI — không áp, không hiện cho dịch vụ khác.
  const discount = !isLongTerm && !isWithDriver ? (listing.discountPercent ?? 0) : 0;
  const dailyPrice =
    discount > 0 ? applyDiscountPercent(listing.weekdayPrice, discount) : listing.weekdayPrice;

  const selectedPackage =
    isLongTerm && packageMonths != null
      ? ((listing.longTermPackages ?? []).find((pkg) => pkg.packageMonths === packageMonths) ??
        null)
      : null;

  const displayPrice = isLongTerm
    ? (selectedPackage?.finalPackageAmount ?? listing.monthlyPrice ?? null)
    : isWithDriver
      ? (listing.withDriverDailyPrice ?? dailyPrice)
      : dailyPrice;

  const priceUnit = isLongTerm
    ? selectedPackage
      ? `/${t('packageMonths', { months: selectedPackage.packageMonths })}`
      : t('price.perMonth')
    : t('price.perDay');

  /* `.specLine` — "4 chỗ · Số tự động · Điện", cùng dòng với thẻ chuyến ở màn Xem lại. */
  const specLine = useListingSpecSummary(listing).join(LIST_SEPARATOR);

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack gap={THUMB_GAP} ai="flex-start">
          <YStack w={VEHICLE_THUMB.width} h={VEHICLE_THUMB.height} br={radius.md} ov="hidden">
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              radius={radius.md}
              fallback={<Ionicons name="car-outline" size={space.lg} color={colors.placeholder} />}
            />
          </YStack>

          <YStack f={1} gap={space.xs}>
            {/* `.compactMobile .badge { display: none }` — chỉ còn nhãn giảm giá (`DiscountTag sm`). */}
            {discount > 0 ? (
              <XStack alignSelf="flex-start" bg={colors.discount} br={radius.sm} px={space.sm} py={2}>
                <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
                  -{discount}%
                </Text>
              </XStack>
            ) : null}

            {/* `.compactMobile .name` — body-lg semibold `color-text`. */}
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} numberOfLines={2}>
              {listing.name}
            </Text>
            {/* `.specLine` — body `text-secondary`. */}
            {specLine ? (
              <Text col={colors.textMuted} fos={fontSize.body}>
                {specLine}
              </Text>
            ) : null}
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
              {[domainLabel('vehicleType', listing.vehicleType), listing.shopProvince]
                .filter(Boolean)
                .join(LIST_SEPARATOR)}
            </Text>

            {/* Giá 0đ là giá THẬT; chỉ ẩn khi backend không có giá cho dịch vụ này. */}
            {displayPrice != null && displayPrice !== '' ? (
              <XStack ai="baseline" gap={space.xs} flexWrap="wrap">
                <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                  {fmt.money(displayPrice)}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {priceUnit}
                </Text>
                {/* Gói 1 tháng: giá bình quân BẰNG tổng gói — lặp lại chỉ là nhiễu. */}
                {selectedPackage && selectedPackage.packageMonths > 1 ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {fmt.money(selectedPackage.effectiveMonthlyAmount)}
                    {t('price.perMonth')}
                  </Text>
                ) : !isLongTerm && !isWithDriver && listing.hourlyPrice ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {fmt.money(listing.hourlyPrice)}
                    {t('price.perHour')}
                  </Text>
                ) : null}
              </XStack>
            ) : null}
          </YStack>
        </XStack>

        {/*
          `.compactMobile .pickupPoint, .specs { display: none }` — ở breakpoint điện thoại web bỏ
          điểm nhận xe và bảng thông số khỏi hồ sơ xe (đã có ở thẻ chuyến màn Xem lại).
        */}

        {/*
          Hàng gian hàng mở trang gian hàng công khai — web có liên kết "Xem gian hàng" ở đúng
          chỗ này. Web mở TAB MỚI để không đánh mất wizard; native đẩy màn lên trên, và wizard
          vẫn nằm nguyên trong stack nên lui về là về đúng bước đang dở.

          `ShopQuickInfoCard` biến thể `compact` — CÙNG thẻ với trang chi tiết xe (23/09/2026,
          cùng đợt với web). Trước đó chỗ này tự dựng avatar + tên + điểm đánh giá riêng, và con
          số đó là rating của CHIẾC XE đang đặt chứ không phải của gian hàng: một dòng sao nằm
          ngay dưới tên gian hàng nhưng nói về thứ khác.

          `compact` bỏ giới thiệu, ba chỉ số và dòng tóm tắt uy tín — thẻ này đã có ảnh xe, giá
          và thông số ngay phía trên, không phải chỗ lặp lại cả một hồ sơ gian hàng.
        */}
        {showShop ? (
          <YStack pt={space.md} borderTopWidth={1} borderColor={colors.borderSubtle}>
            <ShopQuickInfoCard
              shop={{
                name: listing.shopName,
                slug: listing.shopSlug,
                logoUrl: listing.shopLogoUrl,
                verified: listing.shopVerified,
                ratingAvg: listing.shopRatingAvg,
                ratingCount: listing.shopRatingCount,
                completedTripCount: listing.shopCompletedTripCount,
              }}
              metrics={listing.shopMetrics}
              variant="compact"
              /* Cùng chữ với liên kết "Xem gian hàng" mà web đặt ở đúng chỗ này. */
              openLabel={t('panel.viewShop')}
            />
          </YStack>
        ) : null}
      </YStack>
    </Card>
  );
}
