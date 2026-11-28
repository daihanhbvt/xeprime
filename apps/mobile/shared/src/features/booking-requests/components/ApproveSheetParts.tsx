import { memo, useMemo, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { toAppTz } from '@xeprime/domain';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { SummaryRow } from '@/components/ui/SummaryRow';
import { Timeline, type TimelineItem } from '@/components/ui/Timeline';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import type { OwnerPayout } from '@/features/bookings/components/OwnerPayoutTable';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';
import type { BookingRequestDecisionTarget } from '../api';
import type { RequestPaymentRow } from './BookingRequestCard';

/**
 * Hai khối đầu của tấm duyệt v2 (Figma `24145:96204`): thẻ "Vehicle Summary" (xe · hình thức ·
 * dòng thời gian nhận/trả · khách) và nhóm "Thanh toán" thu/mở được. Chỉ TRÌNH BÀY - dòng tiền là
 * `requestPaymentRows` của thẻ, số là của server.
 */

const HOLD_STATE_TONE: Record<NonNullable<RequestPaymentRow['state']>, PillTone> = {
  // Figma tấm duyệt: tiền giữ chỗ chưa về = viên CAM "Chưa thanh toán" (người dùng 20/11/2026).
  expected: 'orange',
  awaiting: 'orange',
  unpaid: 'orange',
  paid: 'success',
};

/** Thẻ xe + chuyến + khách (Figma `24145:96562`). */
export const ApprovalTripCard = memo(function ApprovalTripCard({
  request,
  longTerm,
  pickupWish,
  onOpenSchedule,
}: {
  request: BookingRequestDecisionTarget;
  longTerm: boolean;
  /** Dài hạn: nguyện vọng nhận xe đã định dạng - thay cho dòng thời gian (lịch chốt lúc duyệt). */
  pickupWish: string | null;
  /** `undefined` = không có quyền xem xe ⇒ ẩn link "Lịch xe". */
  onOpenSchedule?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Viên chỉ mang BIỂN SỐ như Figma; xe chưa có biển thì rơi về mã xe (20/11/2026).
  const plateLine = request.vehiclePlate || request.vehicleCode || '';
  const { pickupAt, returnAt, deliveryRequested, deliveryAddress } = request;
  const timeline = useMemo<TimelineItem[]>(() => {
    if (longTerm || !pickupAt || !returnAt) return [];
    const pickup = toAppTz(pickupAt);
    const dropoff = toAppTz(returnAt);
    const handover = deliveryRequested ? t('card.handoverDelivery') : t('card.handoverSelf');
    return [
      {
        key: 'pickup',
        dot: 'pickup',
        // Figma "T6, 20/11  17h00 - Giao xe tận nơi": gạch ngắn như màn chi tiết đơn.
        title: `${fmt.rentalPoint(pickup)} - ${handover}`,
        ...(deliveryRequested && deliveryAddress ? { lines: [deliveryAddress] } : {}),
        meta: fmt.rentalDuration(pickup, dropoff),
      },
      { key: 'return', dot: 'return', title: fmt.rentalPoint(dropoff) },
    ];
  }, [longTerm, pickupAt, returnAt, deliveryRequested, deliveryAddress, t, fmt]);

  return (
    <InfoGroupCard accessibilityLabel={t('vehicle.heading')}>
      <XStack ai="center" gap={GAP}>
        <XStack f={1} minWidth={0} ai="center" gap={GAP}>
          <VehicleThumb
            uri={request.vehicleImageUrl ?? null}
            recyclingKey={request.vehicleId}
            accessibilityLabel={request.vehicleName}
          />
          <YStack f={1} minWidth={0} gap={4} jc="center">
            <Text
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {request.vehicleName}
            </Text>
            {/* "Lịch xe ›" cùng hàng biển số - tên xe được cả bề ngang, không bị che (20/11/2026). */}
            <XStack ai="center" jc="space-between" gap={GAP}>
              {plateLine ? <Pill label={plateLine} tone="neutral" size="md" /> : <YStack />}
              {onOpenSchedule ? (
                <LinkArrow
                  label={t('approve.scheduleLink')}
                  icon="chevron-right"
                  accessibilityLabel={t('vehicle.viewScheduleFor', { vehicle: request.vehicleName })}
                  onPress={onOpenSchedule}
                />
              ) : null}
            </XStack>
          </YStack>
        </XStack>
      </XStack>

      <YStack gap={DETAILS_GAP}>
        <RuledRow edge="bottom">
          <SummaryRow
            label={t('detail.service')}
            value={domainLabel('serviceType', request.serviceType)}
          />
        </RuledRow>

        {longTerm ? (
          <SummaryRow
            label={t('longTerm.pickupWish')}
            value={<WrapValue>{pickupWish ?? t('longTerm.wishLegacy')}</WrapValue>}
          />
        ) : (
          <Timeline items={timeline} />
        )}

        <RuledRow edge="top">
          <XStack ai="flex-start" jc="space-between" gap={GAP}>
            <Text
              flexShrink={0}
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
            >
              {t('customer.heading')}
            </Text>
            <YStack f={1} minWidth={0} ai="flex-end" gap={2}>
              <XStack ai="center" gap={GAP} maxWidth="100%">
                <Text
                  flexShrink={1}
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {request.customerName}
                </Text>
                {/* Tuyến hoa hồng còn chờ duyệt KHÔNG trả SĐT (ADR 0028 điều 9) - vắng thì vắng. */}
                {request.customerPhone ? (
                  <Text
                    flexShrink={0}
                    col={colors.textBody}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                  >
                    {request.customerPhone}
                  </Text>
                ) : null}
              </XStack>
              {/* "SĐT tài khoản" gỡ khỏi tấm duyệt của app như Figma (20/11/2026); hồ sơ khách vẫn có. */}
              {request.customerIsRegular ? (
                <YStack alignSelf="flex-end">
                  <Pill label={t('detail.regular')} tone="success" size="md" />
                </YStack>
              ) : null}
            </YStack>
          </XStack>
        </RuledRow>
      </YStack>
    </InfoGroupCard>
  );
});

/** Nhóm "Thanh toán" thu/mở được (Figma `24145:96810`; thu gọn `24145:96950`). */
export const ApprovalPaymentGroup = memo(function ApprovalPaymentGroup({
  rows,
  payout,
}: {
  rows: readonly RequestPaymentRow[];
  isEstimate: boolean;
  /** Đơn giá × số ngày cho dòng phụ dưới "Tiền thuê" - vắng thì không có dòng phụ. */
  payout: OwnerPayout | null;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();

  if (rows.length === 0) return null;

  const rentalCalc =
    payout && payout.unitAmount != null && payout.rentalDays > 0
      ? t('approve.payment.rentalCalc', {
          days: payout.rentalDays,
          price: fmt.pricePerDay(payout.unitAmount),
        })
      : undefined;

  const lastKey = rows[rows.length - 1]?.key;
  const renderRow = (row: RequestPaymentRow) => {
    const final = row.key === lastKey;
    switch (row.key) {
      case 'rental':
        return (
          <SummaryRow
            key={row.key}
            label={t('approve.payment.rental')}
            {...(rentalCalc ? { sub: rentalCalc } : {})}
            value={fmt.money(row.amount)}
            emphasis={final ? 'brand' : 'none'}
          />
        );
      case 'customer':
        return (
          <SummaryRow
            key={row.key}
            label={t('approve.payment.customerTotal')}
            value={fmt.money(row.amount)}
            emphasis={final ? 'brand' : 'none'}
          />
        );
      case 'hold':
        return (
          <SummaryRow
            key={row.key}
            label={t('approve.payment.hold')}
            {...(row.state
              ? {
                  labelExtra: (
                    <Pill
                      // Lúc DUYỆT khách chưa trả gì: "Dự kiến" đọc thành "Chưa thanh toán" như Figma.
                      label={t(`approve.payment.holdState.${row.state === 'expected' ? 'unpaid' : row.state}`)}
                      tone={HOLD_STATE_TONE[row.state]}
                      size="md"
                    />
                  ),
                }
              : {})}
            value={fmt.money(row.amount)}
            emphasis={final ? 'brand' : 'none'}
          />
        );
      case 'payAtPickup':
        return (
          <SummaryRow
            key={row.key}
            label={
              row.state === 'expected'
                ? t('approve.payment.payAtPickupExpected')
                : t('approve.payment.payAtPickup')
            }
            value={fmt.money(row.amount)}
            emphasis="brand"
          />
        );
      default:
        return (
          <SummaryRow
            key={row.key}
            label={row.label}
            value={row.text ?? fmt.money(row.amount)}
            emphasis={final ? 'brand' : 'none'}
          />
        );
    }
  };

  const last = rows[rows.length - 1];

  return (
    <InfoGroupCard
      title={t('detail.paymentHeading')}
      collapsible
      // Figma không có viên "Tạm tính" (người dùng gỡ 20/11/2026).
      collapsedContent={last ? renderRow(last) : null}
    >
      <YStack gap={ROWS_GAP}>{rows.map(renderRow)}</YStack>
    </InfoGroupCard>
  );
});

/** Dòng có vạch mảnh trên/dưới (Figma "Pickup Details": `py 12`, viền `stroke/gray-50`). */
function RuledRow({ edge, children }: { edge: 'top' | 'bottom'; children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack
      py={ROWS_GAP}
      bc={colors.borderSubtle}
      {...(edge === 'top' ? { borderTopWidth: 1 } : { borderBottomWidth: 1 })}
    >
      {children}
    </YStack>
  );
}

/** Giá trị chữ DÀI bên phải (nguyện vọng nhận xe) - xuống tối đa hai dòng, cắt "...". */
function WrapValue({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      flexShrink={1}
      col={colors.text}
      fos={typeScale.body.fontSize}
      lh={typeScale.body.lineHeight}
      fow={fontWeight.medium}
      ta="right"
      numberOfLines={2}
      ellipsizeMode="tail"
    >
      {children}
    </Text>
  );
}

/** Figma: ảnh ↔ chữ 12; các dòng của thẻ cách 8 (`Rental Details`); dòng tiền và viền ngăn `12`. */
const GAP = 12;
const DETAILS_GAP = 8;
const ROWS_GAP = 12;
