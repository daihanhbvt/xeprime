import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  isBookingRequestPastDue,
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  type LongTermPackageMonths,
} from '@xeprime/types';
import {
  appWallClockToIso,
  LIST_SEPARATOR,
  longTermReturnFromWallClock,
  nowInAppTz,
  startOfAppDay,
  toAppTz,
  type Dayjs,
} from '@xeprime/domain';
import { bookingsApi } from '@/api/bookings/api';
import { Callout } from '@/components/ui/Callout';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/queries/query-keys';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { Chip } from '@/components/ui/Chip';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { ApproveBookingRequestInput, BookingRequestDecisionTarget } from '../api';

/** Giờ nhận mặc định khi điền sẵn từ một NGÀY nguyện vọng — cùng hằng với web. */
const DEFAULT_PICKUP_HOUR = 9;

/** Web `disabledDate` của `ApproveLongTermDialog`, viết thành phép KIỂM cho một ngày đã chọn. */
function pickupWithinWish(request: BookingRequestDecisionTarget, day: Dayjs): boolean {
  if (request.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && request.requestedPickupDate) {
    return day.isSame(startOfAppDay(request.requestedPickupDate), 'day');
  }
  if (
    request.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS &&
    request.pickupWindowStartDate &&
    request.pickupWindowEndDate
  ) {
    const start = startOfAppDay(request.pickupWindowStartDate);
    const end = startOfAppDay(request.pickupWindowEndDate).endOf('day');
    return !day.isBefore(start) && !day.isAfter(end);
  }
  return !day.isBefore(nowInAppTz().startOf('day'));
}

/**
 * Duyệt yêu cầu — hai hình thái, cùng một tấm.
 *
 * **Theo ngày**: lịch đã có trong yêu cầu, chỉ xác nhận (body rỗng).
 * **Dài hạn** — bản native của web `ApproveLongTermDialog`: BẮT BUỘC chọn `scheduledPickupAt`
 * TRONG nguyện vọng khách đã nêu; ngày trả = ngày nhận + N THÁNG LỊCH qua `longTermReturnAt` (cùng
 * hàm server dùng — không nhân `số tháng × 30`, ADR 0011); kèm BÁO GIÁ gói từ `/calendar/quote`
 * để người duyệt thấy số tiền mình sắp chốt.
 *
 * Quá hạn thì so `respondBy` chứ không so cột `status`: worker ghi `expired` trễ một nhịp, và cửa
 * sổ đó là một lỗ để duyệt yêu cầu đã chết.
 */
export function ApproveRequestSheet({
  open,
  onClose,
  request,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  request: BookingRequestDecisionTarget;
  onConfirm: (body?: ApproveBookingRequestInput) => void;
  loading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const longTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const pastDue = isBookingRequestPastDue(request.respondBy);

  const requestPackage = request.longTermPackageMonths ?? null;
  /*
   * Điền sẵn giờ nhận từ nguyện vọng (9:00 ngày khách nêu / đầu cửa sổ 7 ngày), đúng web — người
   * duyệt chỉ chỉnh khi cần, không phải chọn lại từ đầu.
   */
  const [pickupAt, setPickupAt] = useState<Dayjs | null>(() =>
    !longTerm
      ? null
      : request.requestedPickupDate
        ? startOfAppDay(request.requestedPickupDate).hour(DEFAULT_PICKUP_HOUR)
        : request.pickupWindowStartDate
          ? startOfAppDay(request.pickupWindowStartDate).hour(DEFAULT_PICKUP_HOUR)
          : request.pickupAt
            ? toAppTz(request.pickupAt)
            : null,
  );
  const [packageMonths, setPackageMonths] = useState<number | null>(requestPackage);
  const [picking, setPicking] = useState(false);
  const effectivePackage = (requestPackage ?? packageMonths) as LongTermPackageMonths | null;

  const returnAt = useMemo(
    () =>
      pickupAt && effectivePackage != null
        ? longTermReturnFromWallClock(pickupAt, effectivePackage)
        : null,
    [pickupAt, effectivePackage],
  );

  const quoteParams =
    longTerm && effectivePackage != null
      ? {
          vehicleId: request.vehicleId,
          serviceType: SERVICE_TYPE.LONG_TERM,
          packageMonths: effectivePackage,
        }
      : null;
  const quote = useQuery({
    queryKey: queryKeys.bookings.quote(quoteParams ?? {}),
    queryFn: () => bookingsApi.quote(quoteParams!),
    enabled: quoteParams !== null,
    staleTime: 60_000,
    retry: false,
  });

  /*
   * Ngày nhận PHẢI nằm trong nguyện vọng — web khoá các ngày khác trên lịch (`disabledDate`). Tấm
   * chọn ngày native không khoá theo cửa sổ, nên kiểm ở đây: ngoài cửa sổ thì nút duyệt tắt và lời
   * dẫn "chỉ chọn trong nguyện vọng" chuyển sang màu cảnh báo.
   */
  const outsideWish = pickupAt ? !pickupWithinWish(request, pickupAt) : false;

  const ready =
    !pastDue && (!longTerm || Boolean(pickupAt && effectivePackage != null && !outsideWish));

  function confirm() {
    if (!longTerm) {
      onConfirm();
      return;
    }
    if (!pickupAt || !packageMonths) return;
    onConfirm({
      // Giờ nhận đã chốt = mặt đồng hồ GIỜ VIỆT NAM — đúng `ApproveLongTermDialog` bên web.
      scheduledPickupAt: appWallClockToIso(pickupAt),
      // Gói chỉ gửi khi yêu cầu LEGACY chưa mang gói — gói khách đã chọn không sửa được (web).
      ...(requestPackage == null
        ? {
            longTermPackageMonths:
              packageMonths as ApproveBookingRequestInput['longTermPackageMonths'],
          }
        : {}),
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={longTerm ? t('longTerm.title') : t('approve.title')}
      footer={
        <Button
          label={longTerm ? t('longTerm.confirm') : t('approve.confirm')}
          icon="checkmark-circle-outline"
          loading={loading}
          disabled={!ready}
          onPress={confirm}
        />
      }
    >
      {pastDue ? (
        <YStack bg={colors.dangerSurface} p={space.md} br={radius.md}>
          <Text col={colors.danger} fos={fontSize.bodySm}>
            {t('approve.expired')}
          </Text>
        </YStack>
      ) : null}

      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <DataRow label={t('approve.vehicle')} value={request.vehicleName} />
          {/*
            Nối bằng `filter(Boolean)`, không phải chuỗi mẫu: chuyến tuyến hoa hồng còn chờ duyệt
            KHÔNG trả SĐT (ADR 0028 điều 9), và `${null}` in ra đúng bốn chữ "null" ngay cạnh tên
            khách. Web thoát điều đó nhờ JSX bỏ qua `null`; ở đây phải nói ra.
          */}
          <DataRow
            label={t('approve.customer')}
            value={
              [request.customerName, request.customerPhone].filter(Boolean).join(LIST_SEPARATOR) +
              // Như web: số tài khoản đã xác minh đi kèm khi khách để lại số liên hệ khác nó.
              (request.customerAccountPhone
                ? ` (${t('customer.accountPhone', { phone: request.customerAccountPhone })})`
                : '')
            }
          />
          {longTerm ? (
            <DataRow
              label={t('longTerm.pickupWish')}
              value={
                request.pickupPreference == null
                  ? t('longTerm.wishLegacy')
                  : fmt.pickupWish(request)
              }
            />
          ) : request.pickupAt && request.returnAt ? (
            <DataRow
              label={t('approve.schedule')}
              value={fmt.shortDateTimeRange(request.pickupAt, request.returnAt)}
            />
          ) : null}
          {/* Như web `ApproveBookingRequestDialog` (#213): tiền thuê + tổng khách — số của server. */}
          {request.pricing ? (
            <>
              <DataRow label={t('approve.rentalTotal')} value={fmt.money(request.pricing.rentalTotal)} />
              <DataRow
                label={t('approve.customerTotal')}
                value={fmt.money(request.pricing.customerTotalAmount)}
                strong
              />
            </>
          ) : null}
        </YStack>
      </Card>

      {longTerm ? (
        <>
          {/* Yêu cầu LEGACY không mang gói: cố ý KHÔNG suy từ khoảng ngày cũ, gian hàng tự chọn. */}
          {request.longTermPackageMonths ? (
            <DataRow
              label={t('longTerm.chosenPackageLabel')}
              value={fmt.packageLabel(request.longTermPackageMonths) ?? ''}
            />
          ) : (
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('longTerm.legacyPackageLabel')}
              </Text>
              <XStack gap={space.xs} flexWrap="wrap">
                {LONG_TERM_PACKAGE_MONTHS.map((months) => (
                  <Chip
                    key={months}
                    label={fmt.packageLabel(months) ?? String(months)}
                    selected={packageMonths === months}
                    size="sm"
                    onPress={() => setPackageMonths(months)}
                  />
                ))}
              </XStack>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('longTerm.legacyPackageHint')}
              </Text>
            </YStack>
          )}

          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fieldFontSize.label} fow={fontWeight.semibold}>
              {t('longTerm.pickupLabel')}
            </Text>
            <Card onPress={() => setPicking(true)} accessibilityLabel={t('longTerm.pickupLabel')}>
              <Text
                col={pickupAt ? colors.text : colors.placeholder}
                fos={fieldFontSize.value}
                fow={fontWeight.medium}
              >
                {pickupAt ? fmt.rentalPoint(pickupAt) : t('longTerm.pickupPlaceholder')}
              </Text>
            </Card>
            <Text col={outsideWish ? colors.danger : colors.textMuted} fos={fieldFontSize.message}>
              {t('longTerm.pickupHint')}
            </Text>
          </YStack>

          {/* Ngày trả TÍNH bằng `longTermReturnAt` — cùng hàm tháng lịch server dùng (ADR 0011). */}
          <YStack gap={space.xs}>
            <DataRow
              label={t('longTerm.returnLabel')}
              value={returnAt ? fmt.rentalPoint(returnAt) : tCommon('labels.emptyValue')}
            />
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {t('longTerm.returnHint')}
            </Text>
          </YStack>

          {effectivePackage != null ? (
            quote.isLoading ? (
              <MiniRowsSkeleton rows={3} />
            ) : quote.data ? (
              <PriceBreakdown
                rows={quote.data.rows}
                totalAmount={quote.data.totalAmount}
                depositAmount={quote.data.depositAmount}
                title={t('longTerm.quoteTitle', {
                  package: fmt.packageLabel(effectivePackage) ?? '',
                })}
              />
            ) : (
              <Callout tone="warning">{t('longTerm.quoteUnavailable')}</Callout>
            )
          ) : null}

          {/* Dùng lại tấm chọn khoảng thuê nhưng chỉ lấy đầu NHẬN — tấm đòi đủ hai đầu, đầu trả bị bỏ qua. */}
          <RentalRangeSheet
            open={picking}
            value={{ pickupAt, returnAt: pickupAt?.add(1, 'day') ?? null }}
            mode="daily"
            onChange={(next) => setPickupAt(next.pickupAt)}
            onModeChange={() => undefined}
            onApply={() => setPicking(false)}
            onCancel={() => setPicking(false)}
          />
        </>
      ) : null}

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('approve.effect')}
      </Text>
      {request.deliveryRequested ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('approve.deliveryNote')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}
