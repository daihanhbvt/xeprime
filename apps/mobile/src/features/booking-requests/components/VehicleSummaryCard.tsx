import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CATALOG_TYPE, SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { applyDiscountPercent, LIST_SEPARATOR } from '@xeprime/domain';
import { catalogLabel } from '@/api/catalog';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Thumbnail ngang giữ mốc nhận diện xe nhưng vẫn để step và trường đầu tiên nằm gần màn đầu. */
const VEHICLE_THUMB = { width: 112, height: 84 } as const;

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
}: {
  listing: PublicListingDetail;
  serviceType: string;
  /** Gói dài hạn đang chọn — có gói thì hiện giá gói THẬT thay cho giá cơ sở /tháng. */
  packageMonths: number | null;
}) {
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const { catalog } = useCatalog();

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

  const specs = [
    listing.manufactureYear
      ? { label: t('panel.specYear'), value: String(listing.manufactureYear) }
      : null,
    listing.seatCount
      ? { label: t('panel.specSeats'), value: t('panel.seatCount', { count: listing.seatCount }) }
      : null,
    listing.bodyType
      ? {
          label: t('panel.specBody'),
          value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '—',
        }
      : null,
    listing.fuelType
      ? {
          label: t('panel.specFuel'),
          value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '—',
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const rating = Number(listing.ratingAvg);
  const hasRating = listing.ratingCount > 0 && Number.isFinite(rating);

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack gap={space.md} ai="flex-start">
          <YStack w={VEHICLE_THUMB.width} h={VEHICLE_THUMB.height} br={radius.md} ov="hidden">
            <RemoteImage
              uri={listing.mainImageUrl}
              recyclingKey={listing.id}
              radius={radius.md}
              fallback={<Ionicons name="car-outline" size={space.lg} color={colors.placeholder} />}
            />
          </YStack>

          <YStack f={1} gap={space.xs}>
            <XStack ai="center" gap={space.xs} flexWrap="wrap">
              {(listing.serviceTypes ?? []).length > 0 ? (
                <XStack bg={colors.surfaceMuted} br={radius.sm} px={space.sm} py={2}>
                  <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
                    {(listing.serviceTypes ?? [])
                      .map((s) => domainLabel('serviceType', s))
                      .join(LIST_SEPARATOR)
                      .toUpperCase()}
                  </Text>
                </XStack>
              ) : null}
              {discount > 0 ? (
                <XStack bg={colors.discount} br={radius.sm} px={space.sm} py={2}>
                  <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
                    -{discount}%
                  </Text>
                </XStack>
              ) : null}
            </XStack>

            <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} numberOfLines={2}>
              {listing.name}
            </Text>
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

        {specs.length > 0 ? (
          <XStack
            flexWrap="wrap"
            rowGap={space.sm}
            p={space.sm}
            br={radius.md}
            bg={colors.surfaceMuted}
          >
            {specs.map((spec) => (
              <YStack key={spec.label} width="50%" gap={2}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {spec.label}
                </Text>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {spec.value}
                </Text>
              </YStack>
            ))}
          </XStack>
        ) : null}

        {/*
          Hàng gian hàng mở trang gian hàng công khai — web có liên kết "Xem gian hàng" ở đúng
          chỗ này. Web mở TAB MỚI để không đánh mất wizard; native đẩy màn lên trên, và wizard
          vẫn nằm nguyên trong stack nên lui về là về đúng bước đang dở.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('panel.viewShop')}
          onPress={() => navigateOnce(ROUTES.explore.shopDetail(listing.shopSlug))}
        >
          <XStack
            ai="center"
            gap={space.sm}
            pt={space.md}
            borderTopWidth={1}
            borderColor={colors.borderSubtle}
          >
            <Avatar name={listing.shopName} url={listing.shopLogoUrl} size={36} />
            <YStack f={1} gap={2}>
              <Text
                col={colors.text}
                fos={fontSize.bodySm}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {listing.shopName}
              </Text>
              {/* Chỉ hiện đánh giá khi CÓ số thật — không dựng "0.0 · 0 đánh giá" giả. */}
              {hasRating ? (
                <XStack ai="center" gap={space.xs}>
                  <Ionicons name="star" size={12} color={colors.primary} />
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('panel.ratingSummary', {
                      avg: fmt.rating(rating),
                      count: listing.ratingCount,
                    })}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
            <Ionicons name="chevron-forward" size={iconSize.xs} color={colors.placeholder} />
          </XStack>
        </Pressable>
      </YStack>
    </Card>
  );
}
