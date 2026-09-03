import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { applyDiscountPercent } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { PublicQuote } from '../api';

/** Một dòng đơn giá khi CHƯA có báo giá — bảng NIÊM YẾT, không phải breakdown. */
interface UnitRow {
  key: string;
  label: string;
  amount: string;
  unit: string;
  /** Giá gạch ngang khi có khuyến mãi trực tiếp. */
  strikeAmount?: string;
}

/**
 * Khối tiền DUY NHẤT của luồng đặt xe, ở hai hình thái LOẠI TRỪ nhau: `bar` (dòng tổng dính đáy)
 * và `detail` (bảng đầy đủ trong mạch cuộn). Dòng tổng biến mất khi bảng mở vì bảng đã có hàng
 * "Tổng dự kiến" của riêng nó.
 *
 * Component KHÔNG cộng trừ gì: có báo giá thì mọi con số đến từ `PricingService`, chưa có thì đọc
 * lại giá NIÊM YẾT của ĐÚNG dịch vụ đang chọn (ADR 0011).
 */
export function BookingPriceSummary({
  listing,
  serviceType,
  routeType,
  quote,
  quoteLoading,
  hasSelection,
  isDelivery = false,
  variant,
  expanded,
  onExpandedChange,
}: {
  listing: PublicListingDetail;
  serviceType: string;
  routeType: string | null;
  quote: PublicQuote | null;
  quoteLoading: boolean;
  /** Khách đã chọn đủ (khoảng thuê, hoặc gói dài hạn) để server báo giá được chưa. */
  hasSelection: boolean;
  isDelivery?: boolean;
  variant: 'bar' | 'detail';
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
}) {
  const t = useTranslations('BookingRequests.flow');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  /** Khuyến mãi trực tiếp thuộc dịch vụ TỰ LÁI — không áp, không hiện ở dịch vụ khác. */
  const promoPercent = !isLongTerm && !isWithDriver ? (listing.discountPercent ?? 0) : 0;

  const breakdown = quote?.breakdown ?? null;
  const longTerm = breakdown?.longTerm ?? null;
  const totalLabel = breakdown?.estimateNote ? t('price.subtotal') : t('price.total');

  const unitRows = buildUnitRows();
  const headline = unitRows[0];
  const isDetail = variant === 'detail';

  function buildUnitRows(): UnitRow[] {
    if (isLongTerm) {
      return listing.monthlyPrice
        ? [
            {
              key: 'monthly',
              label: t('price.longTermBase'),
              amount: listing.monthlyPrice,
              unit: t('price.perMonth'),
            },
          ]
        : [];
    }
    if (isWithDriver) {
      return [
        listing.withDriverDailyPrice
          ? {
              key: 'inCity',
              label: t('price.withDriverInCity'),
              amount: listing.withDriverDailyPrice,
              unit: t('price.perDay'),
            }
          : null,
        listing.withDriverInterCityPrice
          ? {
              key: 'interCity',
              label: t('price.withDriverInterCity'),
              amount: listing.withDriverInterCityPrice,
              unit: t('price.perDay'),
            }
          : null,
        listing.withDriverOneWayPrice
          ? {
              key: 'oneWay',
              label: t('price.withDriverOneWay'),
              amount: listing.withDriverOneWayPrice,
              unit: t('price.perDay'),
            }
          : null,
      ].filter(Boolean) as UnitRow[];
    }
    return [
      listing.weekdayPrice
        ? {
            key: 'weekday',
            label: t('price.weekday'),
            amount:
              (promoPercent > 0
                ? applyDiscountPercent(listing.weekdayPrice, promoPercent)
                : null) ?? listing.weekdayPrice,
            ...(promoPercent > 0 ? { strikeAmount: listing.weekdayPrice } : {}),
            unit: t('price.perDay'),
          }
        : null,
      listing.weekendPrice
        ? {
            key: 'weekend',
            label: t('price.weekend'),
            amount:
              (promoPercent > 0
                ? applyDiscountPercent(listing.weekendPrice, promoPercent)
                : null) ?? listing.weekendPrice,
            ...(promoPercent > 0 ? { strikeAmount: listing.weekendPrice } : {}),
            unit: t('price.perDay'),
          }
        : null,
      listing.hourlyPrice
        ? {
            key: 'hourly',
            label: t('price.hourly'),
            amount: listing.hourlyPrice,
            unit: t('price.perHour'),
          }
        : null,
    ].filter(Boolean) as UnitRow[];
  }

  // Không có giá niêm yết lẫn báo giá thì "Chi tiết" chỉ mở ra một khoảng trống.
  const hasExpandable = (hasSelection && (quoteLoading || breakdown != null)) || headline != null;
  const showDetail = expanded && hasExpandable;
  if (isDetail !== showDetail) return null;

  // Đang chờ báo giá — giữ nguyên chỗ đang đứng, chỉ thay bằng khung chờ.
  if (hasSelection && quoteLoading) {
    return isDetail ? (
      <Card>
        <YStack gap={space.xs}>
          <Skeleton width="45%" height={16} />
          <Skeleton width="90%" height={13} />
          <Skeleton width="70%" height={13} />
        </YStack>
      </Card>
    ) : (
      <Skeleton width="60%" height={20} />
    );
  }

  if (hasSelection && breakdown) {
    if (!isDetail) {
      return (
        <Bar onExpand={() => onExpandedChange(true)}>
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
            {totalLabel}
          </Text>
          <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
            {fmt.money(breakdown.totalAmount)}
          </Text>
        </Bar>
      );
    }

    return (
      <Card>
        <YStack gap={space.sm}>
          <PriceBreakdown
            rows={breakdown.rows}
            totalAmount={breakdown.totalAmount}
            totalLabel={totalLabel}
            depositAmount={breakdown.depositAmount}
            title={
              longTerm
                ? // Tham số ICU tên là `months`. Truyền sai tên thì `use-intl` bỏ cả câu và in
                  // thẳng đường dẫn khoá ('BookingRequests.flow.price.packageTitle') lên màn hình.
                  t('price.packageTitle', { months: longTerm.packageMonths })
                : t('price.detailTitle')
            }
            footer={
              <YStack gap={space.xs}>
                {/*
                  'Tiết kiệm' ở đây CHỈ nói về ưu đãi cam kết thời hạn — tuyệt đối không so với
                  giá thuê theo ngày, vì đó là dịch vụ khác và so như vậy là bịa khuyến mãi
                  (ADR 0011).
                */}
                {longTerm?.durationDiscountPercent ? (
                  <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.bold}>
                    {t('price.savings', {
                      amount: fmt.money(longTerm.durationDiscountAmount),
                      months: longTerm.packageMonths,
                    })}
                  </Text>
                ) : null}
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {breakdown.estimateNote ? `${breakdown.estimateNote}. ` : ''}
                  {isDelivery ? `${t('price.deliveryNote')} ` : ''}
                  {t('price.finalNote')}
                </Text>
              </YStack>
            }
          />

          <CollapseButton onPress={() => onExpandedChange(false)} />
        </YStack>
      </Card>
    );
  }

  // Chưa chọn đủ — bảng giá NIÊM YẾT của đúng dịch vụ đang chọn.
  const hint = isLongTerm ? t('price.choosePackage') : t('price.chooseTime');

  // Xe chưa niêm yết giá cho dịch vụ này — nói thẳng, không dựng một khối rỗng.
  if (!headline) {
    return isDetail ? null : (
      <XStack ai="center" px={space.sm} minHeight={sizing.touchTarget - space.sm}>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('price.onRequest')}
        </Text>
      </XStack>
    );
  }

  if (!isDetail) {
    return (
      <Bar onExpand={() => onExpandedChange(true)}>
        <YStack f={1}>
          <XStack ai="baseline" gap={space.xs} flexWrap="wrap">
            <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
              {t('price.fromUnit', { price: fmt.money(headline.amount) })}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {headline.unit}
            </Text>
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {hint}
          </Text>
        </YStack>
      </Bar>
    );
  }

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('price.unitTitle', { service: domainLabel('serviceType', serviceType) })}
          </Text>
          {promoPercent > 0 ? (
            <XStack bg={colors.discount} br={radius.sm} px={space.sm} py={2}>
              <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
                -{promoPercent}%
              </Text>
            </XStack>
          ) : null}
        </XStack>

        {unitRows.map((row) => (
          <XStack key={row.key} ai="center" jc="space-between" gap={space.md}>
            {/* `flexShrink` của RN mặc định là 0 — không khai thì nhãn dài đẩy cụm tiền tràn khỏi thẻ. */}
            <Text f={1} flexShrink={1} col={colors.textMuted} fos={fontSize.bodySm}>
              {row.label}
            </Text>
            <XStack ai="baseline" gap={space.xs} flexShrink={0}>
              {row.strikeAmount ? (
                <Text
                  col={colors.placeholder}
                  fos={fontSize.label}
                  textDecorationLine="line-through"
                >
                  {fmt.money(row.strikeAmount)}
                </Text>
              ) : null}
              <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.bold}>
                {fmt.money(row.amount)}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {row.unit}
              </Text>
            </XStack>
          </XStack>
        ))}

        <Text col={colors.textMuted} fos={fontSize.label}>
          {isWithDriver && routeType
            ? `${domainLabel('routeType', routeType)} — ${hint}. `
            : `${hint}. `}
          {t('price.finalNote')}
        </Text>

        <CollapseButton onPress={() => onExpandedChange(false)} />
      </YStack>
    </Card>
  );
}

/** Dòng tổng dính đáy + nút MỞ. Nhãn nói VIỆC SẮP XẢY RA, không phải trạng thái hiện tại. */
function Bar({ children, onExpand }: { children: React.ReactNode; onExpand: () => void }) {
  const t = useTranslations('BookingRequests.flow.price');

  return (
    <XStack
      ai="center"
      gap={space.sm}
      bg={colors.primaryLight}
      br={radius.md}
      bw={1}
      bc={colors.primary}
      px={space.md}
      py={space.sm}
      minHeight={sizing.touchTarget}
    >
      {children}
      <Pressable onPress={onExpand} accessibilityRole="button" hitSlop={space.sm}>
        <XStack ai="center" gap={2}>
          <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('expand')}
          </Text>
          <Ionicons name="chevron-down" size={iconSize.xs} color={colors.primaryActive} />
        </XStack>
      </Pressable>
    </XStack>
  );
}

function CollapseButton({ onPress }: { onPress: () => void }) {
  const t = useTranslations('BookingRequests.flow.price');

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <XStack ai="center" jc="center" gap={2} minHeight={sizing.touchTarget - 12}>
        <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('collapse')}
        </Text>
        <Ionicons name="chevron-up" size={iconSize.xs} color={colors.primaryActive} />
      </XStack>
    </Pressable>
  );
}
