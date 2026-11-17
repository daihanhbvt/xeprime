import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  isBookingRequestPastDue,
  LONG_TERM_PACKAGE_MONTHS,
  PERMISSION,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  holdWindowsPreview,
  toHoldWindowsPreviewDto,
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
import { bookingRequestsApi } from '@/api/booking-requests/api';
import { bookingsApi } from '@/api/bookings/api';
import { Callout } from '@/components/ui/Callout';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/queries/query-keys';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { FieldBox } from '@/components/ui/FieldBox';
import { SummaryRow } from '@/components/ui/SummaryRow';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { requestPaymentRows } from './BookingRequestCard';
import { Chip } from '@/components/ui/Chip';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontSize, fontWeight, space } from '@/theme/tokens';
import { ApprovalPaymentGroup, ApprovalTripCard } from './ApproveSheetParts';
import type { ApproveBookingRequestInput, BookingRequestDecisionTarget } from '../api';
import { ApprovalPreviewSummary, type ApprovalWindows } from './ApprovalPreviewSummary';
import { VehicleStillOutAlert } from './VehicleStillOutAlert';
import { DecisionFooter, richBold } from './DecisionSheetParts';

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
 *
 * Hình theo Figma v2 (`24145:94422`): đầu tấm v2 + câu dẫn, thẻ xe/chuyến/khách, nhóm "Thanh toán"
 * và "Lợi nhuận chuyến" thu/mở được (mặc định mở), ô cửa sổ thanh toán; chân tấm "Từ chối" viền đỏ
 * + "Xác nhận yêu cầu". "Từ chối" chỉ hiện khi nơi gọi truyền `onReject` (cùng cổng quyền với nút
 * từ chối trên thẻ) - nó đóng tấm này rồi mở tấm từ chối của CÙNG yêu cầu.
 */
export function ApproveRequestSheet({
  open,
  onClose,
  request,
  onConfirm,
  onReject,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  request: BookingRequestDecisionTarget;
  onConfirm: (body?: ApproveBookingRequestInput) => void;
  /** Chuyển sang tấm từ chối của cùng yêu cầu - bỏ trống (không có quyền) thì ẩn nút "Từ chối". */
  onReject?: () => void;
  loading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const paymentRows = requestPaymentRows(request, t);

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

  /*
   * Đọc LẠI yêu cầu mỗi lần mở tấm (như web): hai cửa sổ của khách (`approvalPreview.windows`) được
   * server ước theo "duyệt NGAY" lúc trả dòng hộp thư — một dòng tải từ 20 phút trước sẽ hứa một
   * cửa sổ thanh toán dài hơn thật, hoặc giấu cảnh báo `tooShort`. Cùng khoá với chi tiết yêu cầu.
   * Trong lúc chờ thì hiện bản của dòng đang có.
   */
  const fresh = useQuery({
    queryKey: queryKeys.bookingRequests.detail(request.id),
    queryFn: () => bookingRequestsApi.detail(request.id),
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const approvalPreview =
    (fresh.data?.id === request.id ? fresh.data.approvalPreview : request.approvalPreview) ?? null;
  // "Xe chưa về" (PR #278) — chỉ CHI TIẾT mang nó (dòng hộp thư không), nên đọc từ lượt đọc lại.
  const stillOut = fresh.data?.id === request.id ? (fresh.data.vehicleStillOut ?? null) : null;
  /*
   * Bản để HIỂN THỊ: dòng nơi gọi đưa + lượt đọc lại (ảnh xe, mã xe, địa chỉ giao, khách quen) -
   * như web `ApproveBookingRequestDialog`. Mọi phép quyết định bên dưới vẫn đọc `request`.
   */
  const view = useMemo<BookingRequestDecisionTarget>(
    () => (fresh.data?.id === request.id ? { ...request, ...fresh.data } : request),
    [fresh.data, request],
  );

  /* "Lịch xe" (web: `has(VEHICLE_VIEW)`): đóng tấm trước - `Modal` nằm trên mọi màn được mở. */
  const canViewSchedule = permissions.has(PERMISSION.VEHICLE_VIEW);
  const openSchedule = useCallback(() => {
    onClose();
    navigateOnce(
      vehicleSchedulePath(
        { name: request.vehicleName, plateNumber: request.vehiclePlate },
        { back: true },
      ),
    );
  }, [onClose, navigateOnce, request.vehicleName, request.vehiclePlate]);

  /*
   * Dài hạn: hai cửa sổ của khách NẾU duyệt ngay với giờ nhận vừa chọn — CÙNG `holdWindowsPreview`
   * server dùng cho yêu cầu theo ngày, trên trần cửa sổ của chính sách phí server trả về. Vẫn là
   * ƯỚC TÍNH, mốc thật chốt lúc duyệt.
   */
  const now = useNow();
  const longTermWindows = useMemo<ApprovalWindows | null>(() => {
    if (!longTerm || !approvalPreview?.collectsHold || !pickupAt) return null;
    return toHoldWindowsPreviewDto(
      holdWindowsPreview({
        now: new Date(now),
        pickupAt: new Date(appWallClockToIso(pickupAt)),
        freeCancelHours: approvalPreview.policyFreeCancelHours,
        paymentWindowMinutes: approvalPreview.policyPaymentWindowMinutes,
      }),
    );
  }, [longTerm, approvalPreview, pickupAt, now]);

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
      chrome="v2"
      headerDivider
      title={longTerm ? t('longTerm.title') : t('approve.title')}
      /*
        Câu dẫn của web (05/11/2026): duyệt xong thẻ sang nhóm nào — "Chờ thanh toán" khi có thu
        tiền giữ chỗ, "Chờ nhận xe" khi đơn có ngay. Dài hạn giữ lời dẫn riêng của tấm. Figma đặt
        dòng phụ ở đầu tấm (chỗ mã đơn - yêu cầu chưa có mã).
      */
      // Dòng phụ: mã đơn khi đã có, chưa có (chưa duyệt) thì "Gửi lúc … · khách" (người dùng 16/11/2026).
      subtitle={[
        request.bookingCode
          ? t('card.bookingCode', { code: request.bookingCode })
          : request.createdAt
            ? t('card.sentAt', { value: fmt.dateTime(request.createdAt) })
            : null,
        request.customerName,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)}
      footer={
        <DecisionFooter
          leading={
            onReject ? (
              <Button
                label={t('actions.reject')}
                variant="dangerOutline"
                block={false}
                disabled={loading}
                onPress={onReject}
              />
            ) : null
          }
          confirm={
            <Button
              label={longTerm ? t('longTerm.confirm') : t('approve.confirm')}
              variant="gradient"
              loading={loading}
              disabled={!ready}
              onPress={confirm}
            />
          }
        />
      }
    >
      {pastDue ? <Callout tone="danger" title={t('approve.expired')} /> : null}

      <ApprovalTripCard
        request={view}
        longTerm={longTerm}
        pickupWish={request.pickupPreference == null ? null : fmt.pickupWish(request)}
        {...(canViewSchedule ? { onOpenSchedule: openSchedule } : {})}
      />

      {/*
        Web `ApproveBookingRequestDialog`: khối "Thanh toán" + nhãn "Tạm tính" với CÙNG các dòng
        của thẻ (`requestPaymentRows`) - giữ chỗ dự kiến, trả khi nhận xe dự kiến - số của server.
      */}
      {request.pricing ? (
        <ApprovalPaymentGroup
          rows={paymentRows}
          isEstimate={request.pricing.isEstimate}
          payout={approvalPreview?.ownerPayout ?? null}
        />
      ) : null}

      {longTerm ? (
        <>
          {/* Yêu cầu LEGACY không mang gói: cố ý KHÔNG suy từ khoảng ngày cũ, gian hàng tự chọn. */}
          {request.longTermPackageMonths ? (
            <SummaryRow
              label={t('longTerm.chosenPackageLabel')}
              value={fmt.packageLabel(request.longTermPackageMonths) ?? ''}
            />
          ) : (
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fieldFontSize.label} fow={fontWeight.semibold}>
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

          {/* Ngoài nguyện vọng ⇒ lời dẫn chuyển sang màu lỗi (nút duyệt đã tắt theo `ready`). */}
          <FieldBox
            label={t('longTerm.pickupLabel')}
            value={pickupAt ? fmt.rentalPoint(pickupAt) : ''}
            placeholder={t('longTerm.pickupPlaceholder')}
            icon="calendar-outline"
            required
            onPress={() => setPicking(true)}
            {...(outsideWish
              ? { error: t('longTerm.pickupHint') }
              : { hint: t('longTerm.pickupHint') })}
          />

          {/* Ngày trả TÍNH bằng `longTermReturnAt` — cùng hàm tháng lịch server dùng (ADR 0011). */}
          <YStack gap={space.xs}>
            <SummaryRow
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

      {/*
        Xem trước lượt duyệt (ADR 0064): "Lợi nhuận chuyến" (hoa hồng/thuế, ví điểm nhận gì) và ô
        cửa sổ của khách NẾU duyệt NGAY. Dài hạn legacy chưa mang gói: chỉ hiện hai cửa sổ (tiền
        xem ở bảng giá gói phía trên).
      */}
      {approvalPreview ? (
        longTerm ? (
          <ApprovalPreviewSummary
            preview={approvalPreview}
            windows={longTermWindows}
            windowsPendingHint={t('approvalPreview.longTermPickPickup')}
            showMoney={requestPackage != null}
            onLeave={onClose}
          />
        ) : (
          <ApprovalPreviewSummary
            preview={approvalPreview}
            heading={t('approve.profitHeading')}
            onLeave={onClose}
          />
        )
      ) : null}

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('approve.effect')}
      </Text>
      <VehicleStillOutAlert stillOut={stillOut} />
      {request.deliveryRequested ? <Callout tone="info" title={t('approve.deliveryNote')} /> : null}
    </BottomSheet>
  );
}
