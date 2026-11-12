import { useCallback, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HISTORY_OUTCOME,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  BOOKING_STATUS_META,
  canTransitionBooking,
  CANCELLATION_REASON_CATEGORY,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS_META,
  DRIVER_INCIDENT_LEVEL,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  DRIVER_SOURCE,
  isDriverMissingAlertDue,
  isDriverReassignable,
  STATUS_COLOR,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  HANDOVER_TYPE,
  type HandoverType,
  isBookingFinal,
  isNoShowGracePassed,
  PERMISSION,
  PLAN_FEATURE,
  SERVICE_TYPE,
  type BookingStatus,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { isZeroMoney, LIST_SEPARATOR, telHref, toAppTz } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useNow } from '@/hooks/use-now';
import { layout } from '@/theme/layout';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { AssignDriverSheet } from './components/AssignDriverSheet';
import { BookingDriverHistory } from './components/BookingDriverHistory';
import { BookingMoneyCard } from './components/BookingMoneyCard';
import { BookingStatusSheet, type Decision } from './components/BookingStatusSheet';
import { BookingSettlementCard } from './components/BookingSettlementCard';
import { BookingInsurancePanel } from './components/BookingInsurancePanel';
import { BookingExtensionsPanel } from './components/BookingExtensionsPanel';
import { HandoverPrepCard, missingPhotoSlots, prepRowStates } from './components/HandoverPrepCard';
import {
  BookingOutcomeBanner,
  BookingStepper,
  TripScheduleCard,
} from './components/BookingStageSections';
import { DeliveryFeeSheet } from './components/DeliveryFeeSheet';
import { EditBookingSheet } from './components/EditBookingSheet';
import { AssignDriverWageSheet } from './components/AssignDriverWageSheet';
import { DriverWageEditSheet } from './components/DriverWageEditSheet';
import { DriverWageInfo } from './components/DriverWageInfo';
import {
  useAssignDriver,
  useBooking,
  useBookingDriverHistory,
  useDriverWageQuote,
  useTransitionBooking,
  useUpdateDeliveryFee,
} from './hooks/use-bookings';
import type { BookingDetail, BookingDriverHistoryItem, BookingDriverIncident } from './api';
import { getErrorMessage } from '@/lib/get-error-message';

/** Ảnh xe: tỉ lệ cố định để hàng thẳng dù ảnh nguồn dọc hay ngang — cùng cách thẻ hộp thư làm. */
const VEHICLE_IMAGE = { width: 96, height: 72 } as const;

/* `Image` của React Native cần style phẳng — Tamagui không có primitive ảnh thay thế. */
const useStyles = makeStyles((colors) => ({
  vehicleImage: {
    width: VEHICLE_IMAGE.width,
    height: VEHICLE_IMAGE.height,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
}));

/** Nhãn của một KHỐI trong thẻ chi tiết — nhỏ, viết hoa, mờ. Cùng vai `blockTitle` của web. */
function BlockTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack w={3} h={iconSize.sm} br={radius.pill} bg={colors.primary} />
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {children.toUpperCase()}
      </Text>
    </XStack>
  );
}

/**
 * Chi tiết một đơn thuê (BKG-08, 12, 13).
 *
 * Thanh hành động dính đáy có **đúng một CTA chính**, và nó suy từ NGỮ CẢNH BÀN GIAO chứ không
 * từ một dropdown trạng thái:
 *
 * - `canStartPickup && !pickup.confirmedAt` → *"Xác nhận đã giao xe"*
 * - `canStartReturn && !return.confirmedAt` → *"Xác nhận đã nhận xe"*
 * - không thoả → **không có CTA**
 *
 * Thao tác phụ bày thẳng, không giấu sau menu ba chấm — chúng đều là việc thường ngày ở quầy.
 */
/** Web `BookingDriverSection .row { gap: 10px }` — không có bậc này trên thang token. */
const UNASSIGNED_ROW_GAP = 10;

export function BookingDetailScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings.detail');
  const router = useRouter();
  const query = useBooking(bookingId);

  const back = () => goBackOr(router, ROUTES.manage.bookings());

  if (query.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack gap={layout.section}>
            <Skeleton height={90} />
            <SkeletonText lines={5} />
            <Skeleton height={180} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError) {
    /*
     * Đơn bị xoá và lỗi mạng là hai chuyện khác nhau — không mời "thử lại" cho cái đã biến mất.
     * Cùng phép nhận biết với `BookingDetailContent` bên web (câu của server có "Không tìm thấy").
     */
    const notFound = getErrorMessage(query.error).includes('Không tìm thấy');
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {notFound ? (
            <ScreenMessage
              icon="document-text-outline"
              title={t('notFoundTitle')}
              description={t('notFoundBody')}
              actionLabel={t('backToList')}
              onAction={() => router.replace(ROUTES.manage.bookings())}
            />
          ) : (
            <ScreenError
              messageFrom="backend"
              error={query.error}
              title={t('errorTitle')}
              onRetry={() => void query.refetch()}
            />
          )}
        </Screen>
      </>
    );
  }

  return <BookingDetailBody booking={query.data} onBack={back} />;
}

/**
 * Kéo-xuống-làm-mới cho CẢ màn, không riêng thẻ trên cùng.
 *
 * Màn chi tiết đọc bốn nguồn: chính đơn, ngữ cảnh bàn giao (thẻ "Quản lý chuyến đi" và CTA của
 * thanh hành động), quyết toán (thẻ "Phát sinh & Tiền cọc") và lịch sử tiền. Làm mới mỗi
 * `useBooking` thì ba thẻ kia vẫn hiện số cũ — mà đó đúng là những thứ đổi liên tục ở quầy: ai
 * đó vừa thu tiền, vừa xác nhận giao xe.
 *
 * Vì thế nó invalidate cả NHÁNH `bookings` của đơn này thay vì gọi `refetch` của một truy vấn.
 * `isFetching` đếm mọi truy vấn đang chạy trong nhánh, nên vòng xoay tắt khi thứ CUỐI CÙNG về —
 * không phải khi thứ đầu tiên về.
 */
function useBookingRefresh(bookingId: string) {
  const queryClient = useQueryClient();

  const refreshing =
    useIsFetching({
      queryKey: queryKeys.bookings.all,
      predicate: (query) => query.queryKey.includes(bookingId),
    }) > 0;

  return {
    refreshing,
    onRefresh: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.bookings.all,
        predicate: (query) => query.queryKey.includes(bookingId),
      });
    },
  };
}

function BookingDetailBody({ booking, onBack }: { booking: BookingDetail; onBack: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { refreshing, onRefresh } = useBookingRefresh(booking.id);
  const t = useTranslations('Bookings');
  const tSide = useTranslations('Bookings.detailPage.side');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [assigningDriver, setAssigningDriver] = useState(false);
  const [editingFee, setEditingFee] = useState(false);
  const [editing, setEditing] = useState(false);

  const transition = useTransitionBooking(booking.id);
  const assignDriver = useAssignDriver(booking.id);

  const tDriver = useTranslations('Drivers.booking');
  const tWage = useTranslations('Drivers.wage');
  const [confirmingUnassign, setConfirmingUnassign] = useState(false);
  // Tài xế vừa chọn ở bộ chọn — chờ nhập tiền công trong tấm gán (ADR 0075).
  const [pickedDriver, setPickedDriver] = useState<{ id: string; name: string } | null>(null);
  const [editingWage, setEditingWage] = useState<BookingDriverHistoryItem | null>(null);
  // Lối "Huỷ chuyến do thiếu tài xế" (ADR 0074) mở tấm huỷ với nhóm lý do chọn sẵn.
  const [cancelPreset, setCancelPreset] = useState<CancellationReasonCategory | undefined>();
  const now = useNow();

  /** Bỏ gán HỎI LẠI, đúng `Popconfirm` của web: tài xế đã nhận chuyến sẽ mất chuyến đó (ADR 0063). */
  const unassignDriver = useCallback(
    () =>
      assignDriver.mutate({ driverId: null }, {
        onSuccess: () => {
          setConfirmingUnassign(false);
          toast.showSuccess(t('driver.unassignSuccess'));
        },
        onError: (error) => {
          setConfirmingUnassign(false);
          toast.showError(errorMessage(error));
        },
      }),
    [assignDriver, t, toast],
  );
  const updateFee = useUpdateDeliveryFee(booking.id);
  const status = booking.status as BookingStatus;
  const meta = BOOKING_STATUS_META[status];
  const closed = isBookingFinal(status);

  const canUpdate = permissions.has(PERMISSION.BOOKING_UPDATE);
  // Cổng của khối "Chuẩn bị bàn giao" — cùng `can` của web (BookingDetailActions).
  const prepFinance = useFeature(PLAN_FEATURE.FINANCE);
  const prepContracts = useFeature(PLAN_FEATURE.CONTRACTS);
  const prepCan = {
    collect: permissions.has(PERMISSION.PAYMENT_RECORD) && prepFinance.isVisible,
    contract: permissions.has(PERMISSION.CONTRACT_MANAGE) && prepContracts.isVisible,
    markPrep: permissions.has(PERMISSION.HANDOVER_MANAGE) && !closed,
    documents:
      Boolean(booking.tenantCustomerId) && permissions.has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE),
    managePhotos: permissions.has(PERMISSION.HANDOVER_MANAGE),
  };
  const withDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  /*
   * Tài xế mở cho CẢ HAI tuyến, không sau cờ gói (ADR 0063) — chỉ gác bằng quyền. Và CHỈ đơn
   * `with_driver` mới nhận tài xế: đơn khác chỉ còn đọc tài xế gán từ trước (dữ liệu cũ).
   */
  const canWriteDriver =
    canUpdate &&
    withDriver &&
    !closed &&
    // Đã giao xe ⇒ người cầm lái đã chốt: chỉ đọc (server chặn — DRIVER_ASSIGNMENT_LOCKED).
    isDriverReassignable(booking.status);
  // Bộ chọn tài xế LIÊN KẾT đọc `/drivers/assignable` (DRIVER_VIEW) — thiếu quyền thì không bày nút.
  // Không còn ghi tài xế ngoài hệ thống (ADR 0074 điều 4 — `EXTERNAL_DRIVER_NOT_SUPPORTED`).
  const canAssignDriver = canWriteDriver && permissions.has(PERMISSION.DRIVER_VIEW);
  const driver = booking.driver ?? null;
  const isExternalDriver = driver?.source === DRIVER_SOURCE.EXTERNAL;
  const driverIncident = booking.driverIncident ?? null;
  const canCancelBooking = canUpdate && canTransitionBooking(status, BOOKING_STATUS.CANCELLED);
  // Thẻ sự cố đã nói việc cần làm — không chồng thêm cảnh báo "sắp tới giờ chưa có tài xế".
  const driverMissingSoon =
    !driverIncident &&
    withDriver &&
    isDriverReassignable(booking.status) &&
    isDriverMissingAlertDue({ pickupAt: booking.pickupAt, hasDriver: driver !== null }, new Date(now));

  // Lịch sử lượt gán mang tiền công của lượt ĐANG MỞ — tải luôn cho đơn có tài xế (như web).
  const driverHistory = useBookingDriverHistory(booking.id, withDriver);
  const openAssignment =
    driverHistory.data?.find((h) => h.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN) ?? null;
  // Số ngày của đơn đổi sau khi gán — server không tự tính lại tiền công, chỉ nhắc.
  const wageQuote = useDriverWageQuote(booking.id, withDriver && canUpdate && openAssignment !== null);
  const wageDaysChanged =
    openAssignment?.wage.days != null &&
    wageQuote.data &&
    wageQuote.data.days !== openAssignment.wage.days
      ? { from: openAssignment.wage.days, to: wageQuote.data.days }
      : null;

  /**
   * NHÓM lý do đi kèm CHỈ khi huỷ — `TransitionBookingDto` đòi nó ở đúng nhánh đó (ADR 0045
   * điều 1), và gửi thừa ở `no_show` là ghi một phân loại cho một việc không phải lượt huỷ.
   */
  function confirmDecision(input: { reason: string; reasonCategory?: CancellationReasonCategory }) {
    if (!decision) return;
    transition.mutate(
      { status: decision, ...input },
      {
        onSuccess: () => {
          toast.showSuccess(
            decision === BOOKING_STATUS.CANCELLED
              ? t('statusActions.dialog.cancelSuccess', { code: booking.code })
              : t('statusActions.dialog.noShowSuccess', { code: booking.code }),
          );
          setDecision(null);
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  return (
    <>
      <AppHeader
        title={t('detail.titleWithCode', { code: booking.code })}
        subtitle={booking.vehicleName}
        onBack={onBack}
      />
      <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
        <YStack gap={layout.section}>
          {/*
            MỘT thẻ "Chi tiết đơn đặt xe" gom bốn khối, đúng thứ tự web dựng: phương tiện → khách
            → hành trình (chỉ đơn có tài xế) → thời gian thuê. Một danh sách `DataRow` phẳng thì
            tên xe, khách, giờ giấc và ghi chú cùng một tông, mất hết thứ bậc web có.
          */}
          <Card>
            <YStack gap={space.md}>
              <XStack ai="flex-start" jc="space-between" gap={space.sm}>
                <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('detail.cardTitle')}
                </Text>
                <StatusBadge
                  label={
                    /* Đơn huỷ nói AI huỷ — phía huỷ do SERVER suy (web `BookingStageChip`, ADR 0045). */
                    status === BOOKING_STATUS.CANCELLED &&
                    booking.cancellationParty === CANCELLATION_PARTY.CUSTOMER
                      ? domainLabel(
                          'bookingHistoryOutcome',
                          BOOKING_HISTORY_OUTCOME.CANCELLED_BY_CUSTOMER,
                        )
                      : status === BOOKING_STATUS.CANCELLED &&
                          booking.cancellationParty === CANCELLATION_PARTY.HOST
                        ? domainLabel('bookingHistoryOutcome', BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST)
                        : domainLabel('bookingStatus', status, meta.label)
                  }
                  color={meta.color}
                  size="sm"
                />
              </XStack>
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('detail.createdAt', { value: fmt.dateTime(booking.createdAt) })}
              </Text>

              {/* Phương tiện */}
              <YStack gap={space.sm}>
                <BlockTitle>{t('detail.vehicleBlock')}</BlockTitle>
                <XStack gap={space.sm}>
                  {/*
                    Ảnh chỉ hiện khi xe THẬT SỰ có — không dựng khung xám giả trông như đang tải
                    mãi. Cùng quyết định với web.
                  */}
                  {booking.vehicleImageUrl ? (
                    <Image
                      source={{ uri: booking.vehicleImageUrl }}
                      style={styles.vehicleImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                      accessibilityLabel={booking.vehicleName}
                    />
                  ) : null}
                  <YStack f={1} gap={2}>
                    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                      {booking.vehicleName}
                    </Text>
                    {booking.vehiclePlate ? (
                      // Biển số tô gold như web: đó là thứ nhân viên đọc to khi giao xe.
                      <Text
                        col={colors.primaryActive}
                        fos={fontSize.body}
                        fow={fontWeight.semibold}
                      >
                        {booking.vehiclePlate}
                      </Text>
                    ) : null}
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {domainLabel('serviceType', booking.serviceType)}
                    </Text>
                  </YStack>
                </XStack>
              </YStack>

              {/* Khách hàng */}
              <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
                <BlockTitle>{t('detail.customerBlock')}</BlockTitle>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                  {booking.customerName}
                </Text>
                {/* "Khách quen" — đủ số chuyến hoàn tất với gian hàng (web `BookingDetailSide`). */}
                {booking.customerCompletedRentals != null &&
                booking.customerCompletedRentals >= TENANT_CUSTOMER_RETURNING_MIN_RENTALS ? (
                  <XStack>
                    <StatusBadge
                      label={tSide('returningCustomer')}
                      color={STATUS_COLOR.SUCCESS}
                      size="sm"
                    />
                  </XStack>
                ) : null}
                {booking.customerPhone ? (
                  // Vận hành gọi khách ngay từ đây — trên điện thoại là một chạm.
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${booking.customerPhone}`)}
                    accessibilityRole="button"
                    accessibilityLabel={booking.customerPhone}
                  >
                    <Text col={colors.primaryActive} fos={fontSize.body}>
                      {booking.customerPhone}
                    </Text>
                  </Pressable>
                ) : (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('detail.noPhone')}
                  </Text>
                )}
              </YStack>

              {/* Hành trình: CHỈ đơn có tài xế, đúng như web. */}
              {withDriver ? (
                <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
                  <BlockTitle>{t('detail.routeBlock')}</BlockTitle>
                  <DataRow
                    label={t('detail.route')}
                    value={
                      booking.routeType
                        ? domainLabel('routeType', booking.routeType)
                        : t('detail.unknown')
                    }
                  />
                  <DataRow
                    label={t('detail.pickupAddress')}
                    value={booking.pickupAddress ?? t('detail.unknown')}
                    block
                  />
                  {booking.destination ? (
                    <DataRow label={t('detail.destination')} value={booking.destination} block />
                  ) : null}
                </YStack>
              ) : null}

              {/* Thời gian thuê */}
              <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
                <BlockTitle>{t('detail.scheduleBlock')}</BlockTitle>
                <DataRow
                  label={t('detail.pickupAt')}
                  value={fmt.rentalPoint(toAppTz(booking.pickupAt))}
                />
                <DataRow
                  label={t('detail.returnAt')}
                  value={fmt.rentalPoint(toAppTz(booking.returnAt))}
                />
                {/*
                  Đơn THUÊ DÀI HẠN dài đúng bằng GÓI (tháng lịch — ADR 0011). Nói "92 ngày" cho
                  gói 3 tháng là đúng số nhưng sai đơn vị nghiệp vụ: gói mới là thứ hai bên ký.
                */}
                <DataRow
                  label={t('detail.duration')}
                  value={
                    booking.longTermPackageMonths
                      ? (fmt.packageLabel(booking.longTermPackageMonths) ?? '')
                      : fmt.rentalDuration(toAppTz(booking.pickupAt), toAppTz(booking.returnAt))
                  }
                />
                {/*
                  Mốc THỰC TẾ chỉ hiện khi đã có — chưa giao xe mà bày một dòng trống là mời
                  người đọc tự điền lấy một giả định.
                */}
                {booking.actualPickupAt ? (
                  <DataRow
                    label={t('detail.actualPickup')}
                    value={fmt.rentalPoint(toAppTz(booking.actualPickupAt))}
                  />
                ) : null}
                {booking.actualReturnAt ? (
                  <DataRow
                    label={t('detail.actualReturn')}
                    value={fmt.rentalPoint(toAppTz(booking.actualReturnAt))}
                  />
                ) : null}
              </YStack>

              {booking.note ? (
                <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
                  <BlockTitle>{t('detail.noteBlock')}</BlockTitle>
                  <Text col={colors.text} fos={fontSize.bodySm}>
                    {booking.note}
                  </Text>
                </YStack>
              ) : null}
            </YStack>
          </Card>

          <BookingMoneyCard
            booking={booking}
            {...(canUpdate && !closed ? { onEditFee: () => setEditingFee(true) } : {})}
          />

          {/*
            Hành động đi THEO DÒNG nội dung, không dính đáy — đúng như web, nơi thanh này nằm ở
            chân thẻ chi tiết ngay sau khối chi phí.

            Bản dính đáy đã bỏ: trên điện thoại nó ăn một dải cố định ở mọi đơn, và dải đó lớn
            dần theo số nút mà số nút thì đổi theo quyền. Đổi lại người dùng phải cuộn tới nơi
            mới bấm được — chấp nhận được, vì đây là màn ĐỌC trước rồi mới quyết định.
          */}
          <BookingActionBar
            booking={booking}
            status={status}
            onEdit={() => setEditing(true)}
            onDecide={setDecision}
            prepCan={prepCan}
          />

          {/*
            Khối "Tài xế" (ADR 0063) — gương `BookingDriverSection` của web: chỉ đơn `with_driver`
            có tài xế; đơn khác ẩn hẳn khối, trừ khi còn một tài xế gán từ trước (chỉ-đọc, để không
            ai mất dấu người đang cầm xe). Gán xong là "chờ tài xế nhận" tới khi họ nhận ở app khách.
          */}
          {withDriver || booking.driver ? (
            <Card>
              <YStack gap={space.sm}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('driver.title')}
                </Text>

                {!withDriver ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {tDriver('legacyHint')}
                  </Text>
                ) : null}

                {/* Người trực chọn tài xế theo tuyến — hành trình nhắc lại ngay tại khối phân công. */}
                {withDriver && booking.routeType ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {[
                      domainLabel('routeType', booking.routeType),
                      booking.pickupAddress
                        ? tDriver('pickup', { address: booking.pickupAddress })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(LIST_SEPARATOR)}
                    {booking.destination
                      ? ` ${tDriver('destination', { destination: booking.destination })}`
                      : ''}
                  </Text>
                ) : null}
                {driverIncident ? (
                  <DriverIncidentCallout
                    incident={driverIncident}
                    action={
                      canCancelBooking ? (
                        <Button
                          label={tDriver('incident.cancelForDriver')}
                          variant="danger"
                          size="sm"
                          block={false}
                          onPress={() => {
                            setCancelPreset(CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE);
                            setDecision(BOOKING_STATUS.CANCELLED);
                          }}
                        />
                      ) : null
                    }
                  />
                ) : null}
                {driverMissingSoon ? (
                  <Callout
                    tone="warning"
                    title={tDriver('missingSoon', { hours: DRIVER_MISSING_ALERT_LEAD_MINUTES / 60 })}
                  />
                ) : null}
                {booking.driver ? (
                  <XStack ai="center" gap={space.sm} flexWrap="wrap">
                    <Ionicons
                      name="person-circle-outline"
                      size={iconSize.lg}
                      color={colors.textMuted}
                    />
                    <YStack f={1} gap={2} minWidth={0}>
                      <XStack ai="center" gap={space.xs} flexWrap="wrap">
                        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                          {booking.driver.name}
                        </Text>
                        {isExternalDriver ? (
                          <StatusBadge
                            label={tDriver('externalTag')}
                            color={STATUS_COLOR.NEUTRAL}
                            size="sm"
                          />
                        ) : (
                          <StatusBadge
                            label={domainLabel(
                              'driverAssignmentStatus',
                              booking.driver.assignmentStatus,
                              DRIVER_ASSIGNMENT_STATUS_META[booking.driver.assignmentStatus].label,
                            )}
                            color={
                              DRIVER_ASSIGNMENT_STATUS_META[booking.driver.assignmentStatus].color
                            }
                            size="sm"
                          />
                        )}
                      </XStack>
                      {booking.driver.phone ? (
                        <Pressable
                          onPress={() => {
                            const tel = telHref(booking.driver?.phone ?? '');
                            if (tel) void Linking.openURL(tel);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={booking.driver.phone}
                        >
                          <Text col={colors.primaryActive} fos={fontSize.bodySm}>
                            {booking.driver.phone}
                          </Text>
                        </Pressable>
                      ) : null}
                      <Text col={colors.textMuted} fos={fontSize.label}>
                        {isExternalDriver
                          ? tDriver('externalSetAt', {
                              time: fmt.dateTime(booking.driver.assignedAt),
                            })
                          : booking.driver.respondedAt
                            ? tDriver('respondedAt', {
                                time: fmt.dateTime(booking.driver.respondedAt),
                              })
                            : tDriver('assignedAt', {
                                time: fmt.dateTime(booking.driver.assignedAt),
                              })}
                      </Text>
                      {/* Hạn tài xế trả lời (ADR 0066) — quá hạn thì hệ thống trả lượt về và báo khẩn. */}
                      {booking.driver.respondBy ? (
                        <Text col={colors.warning} fos={fontSize.label}>
                          {tDriver('respondBy', { time: fmt.dateTime(booking.driver.respondBy) })}
                        </Text>
                      ) : null}
                      {isExternalDriver && canWriteDriver ? (
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {tDriver('externalLegacy')}
                        </Text>
                      ) : null}
                      {openAssignment ? (
                        <DriverWageInfo
                          wage={openAssignment.wage}
                          canEdit={canUpdate}
                          onEdit={() => setEditingWage(openAssignment)}
                        />
                      ) : null}
                      {wageDaysChanged ? (
                        <Text col={colors.warning} fos={fontSize.label}>
                          {tWage('daysChanged', wageDaysChanged)}
                        </Text>
                      ) : null}
                    </YStack>

                    {/*
                      Cụm nút CHỮ nhỏ, đúng nhãn/thứ tự của web `BookingDriverSection`: Đổi tài xế ·
                      Bỏ gán (hỏi lại). Hàng tự xuống dòng khi hẹp, như `.row`.
                    */}
                    {canWriteDriver ? (
                      <XStack gap={space.xs} flexWrap="wrap">
                        {canAssignDriver ? (
                          <Button
                            label={tDriver('change')}
                            variant="secondary"
                            size="sm"
                            block={false}
                            onPress={() => setAssigningDriver(true)}
                          />
                        ) : null}
                        <Button
                          label={tDriver('unassign')}
                          variant="secondary"
                          size="sm"
                          block={false}
                          loading={assignDriver.isPending}
                          onPress={() => setConfirmingUnassign(true)}
                        />
                      </XStack>
                    ) : null}
                  </XStack>
                ) : (
                  /*
                    Web `BookingDriverSection .row` (nhánh chưa phân công): xuống dòng khi hẹp
                    (`flex-wrap`), hai đầu (`space-between`), khe 10. Chữ `.missing` — màu
                    `color-warning`, medium; KHÔNG có icon. Cụm `.actions` khe 8: "Gán tài xế" (primary
                    nhỏ). Không còn lối tài xế ngoài hệ thống (ADR 0074 điều 4).
                  */
                  <XStack ai="center" jc="space-between" flexWrap="wrap" gap={UNASSIGNED_ROW_GAP}>
                    {/* Đơn có tài xế chưa phân công là chưa chạy được — nhắc bằng màu cảnh báo. */}
                    <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
                      {tDriver('unassigned')}
                    </Text>
                    {canAssignDriver ? (
                      <XStack gap={space.sm} flexWrap="wrap">
                        <Button
                          label={t('driver.assign')}
                          variant="primary"
                          size="sm"
                          block={false}
                          onPress={() => setAssigningDriver(true)}
                        />
                      </XStack>
                    ) : null}
                  </XStack>
                )}
                {withDriver ? (
                  <BookingDriverHistory
                    bookingId={booking.id}
                    canEditWage={canUpdate}
                    onEditWage={setEditingWage}
                  />
                ) : null}
              </YStack>
            </Card>
          ) : null}

          {/* Banner kết cục + tiến trình 4 chặng + chuyến đi (Figma `23845:49956`, 03/11/2026). */}
          <BookingOutcomeBanner booking={booking} />
          <BookingStepper booking={booking} />
          {/* Thay `BookingTripCard` cũ (trùng giờ giao/nhận + Odo) — khớp web `TripScheduleCard`. */}
          <TripScheduleCard booking={booking} />

          {/* Chuẩn bị bàn giao (03/11/2026) — chỉ có khi server trả `handoverPrep`. */}
          <HandoverPrepCard booking={booking} can={prepCan} />

          {/* Phụ lục gia hạn đơn dài hạn (ADR 0077) — tự ẩn với đơn khác. */}
          <BookingExtensionsPanel booking={booking} />

          <BookingSettlementCard bookingId={booking.id} />

          {/* Bảo hiểm chuyến theo từng sản phẩm (ADR 0064) — có ngay khi có đơn, chỉ đọc; như web. */}
          <BookingInsurancePanel bookingId={booking.id} />
        </YStack>
      </Screen>

      {decision ? (
        <BookingStatusSheet
          open
          onClose={() => {
            setDecision(null);
            setCancelPreset(undefined);
          }}
          booking={booking}
          decision={decision}
          defaultReasonCategory={cancelPreset}
          onConfirm={confirmDecision}
          loading={transition.isPending}
        />
      ) : null}

      <AssignDriverSheet
        open={assigningDriver}
        onClose={() => setAssigningDriver(false)}
        booking={booking}
        pending={assignDriver.isPending}
        onSelect={(driverId, name) => {
          // Gán ai cũng qua tấm gán KÈM tiền công (ADR 0075) — như hộp gán của web.
          setAssigningDriver(false);
          setPickedDriver({ id: driverId, name });
        }}
      />

      {/* Mount có điều kiện: mỗi lần mở là một form mới, không mang lượt nhập dở sang. */}
      {pickedDriver ? (
        <AssignDriverWageSheet
          bookingId={booking.id}
          driver={pickedDriver}
          onClose={() => setPickedDriver(null)}
          onAssigned={() => setPickedDriver(null)}
        />
      ) : null}
      {editingWage ? (
        <DriverWageEditSheet
          bookingId={booking.id}
          item={editingWage}
          onClose={() => setEditingWage(null)}
        />
      ) : null}

      <AlertDialog
        open={confirmingUnassign}
        title={tDriver('unassignConfirm')}
        confirmLabel={t('driver.unassign')}
        cancelLabel={tDriver('close')}
        destructive
        loading={assignDriver.isPending}
        onConfirm={unassignDriver}
        onCancel={() => setConfirmingUnassign(false)}
      />

      {/* Mount có điều kiện — xem ghi chú ở `SettlementScreen`: `useForm` chốt mặc định một lần. */}
      {editing ? <EditBookingSheet booking={booking} onClose={() => setEditing(false)} /> : null}

      {editingFee ? (
        <DeliveryFeeSheet
          open
          onClose={() => setEditingFee(false)}
          booking={booking}
          loading={updateFee.isPending}
          onConfirm={(input) =>
            updateFee.mutate(input, {
              onSuccess: () => {
                toast.showSuccess(t('deliveryFee.success'));
                setEditingFee(false);
              },
              onError: (error) => toast.showError(errorMessage(error)),
            })
          }
        />
      ) : null}
    </>
  );
}

/**
 * Thanh hành động dính đáy — **đúng một CTA chính**, suy từ ngữ cảnh bàn giao.
 *
 * Không thoả điều kiện thì KHÔNG có CTA. Đó là chủ ý: một nút "Xác nhận" luôn hiện diện, đôi
 * khi bấm được đôi khi không, dạy người dùng rằng nút này không đáng tin.
 */
/**
 * Thẻ SỰ CỐ TÀI XẾ (ADR 0074) — gương `DriverIncidentAlert` của web. Mọi mốc do server tính
 * (`reassignBy`, `customerCanCancelFree`), ở đây chỉ đọc. Khách đã được huỷ miễn phí ⇒ đỏ; còn
 * trong hạn điều phối ⇒ vàng.
 */
function DriverIncidentCallout({
  incident,
  action,
}: {
  incident: BookingDriverIncident;
  action: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.booking.incident');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const reason = incident.reasonCategory
    ? incident.reason
      ? t('reasonWithNote', {
          reason: domainLabel('driverDropReason', incident.reasonCategory),
          note: incident.reason,
        })
      : t('reason', { reason: domainLabel('driverDropReason', incident.reasonCategory) })
    : null;
  const deadline =
    incident.level === DRIVER_INCIDENT_LEVEL.URGENT
      ? t('urgent')
      : incident.customerCanCancelFree
        ? t('overdue', { time: fmt.dateTime(incident.reassignBy) })
        : t('reassignBy', { time: fmt.dateTime(incident.reassignBy) });

  return (
    <Callout
      tone={incident.customerCanCancelFree ? 'danger' : 'warning'}
      title={
        incident.driverName ? t('titleNamed', { name: incident.driverName }) : t('titleReleased')
      }
    >
      <YStack gap={space.xs}>
        {reason ? (
          <Text col={colors.text} fos={fontSize.bodySm}>
            {reason}
          </Text>
        ) : null}
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('droppedAt', { time: fmt.dateTime(incident.droppedAt) })}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {deadline}
        </Text>
        {action}
      </YStack>
    </Callout>
  );
}

function BookingActionBar({
  booking,
  status,
  onEdit,
  onDecide,
  prepCan,
}: {
  booking: BookingDetail;
  status: BookingStatus;
  /** Cổng của khối "Chuẩn bị bàn giao" — để cảnh báo "còn thiếu" đếm đúng bộ dòng đang hiện. */
  prepCan: { collect: boolean; contract: boolean };
  /** Mở form sửa đơn — state của nó nằm ở màn cha vì tấm trượt mount theo điều kiện. */
  onEdit: () => void;
  /** Mở hộp xác nhận cho một quyết định khép đơn (huỷ / khách không đến). */
  onDecide: (decision: Decision) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.actionBar');
  const tStatus = useTranslations('Bookings.statusActions');
  const [collecting, setCollecting] = useState(false);
  const createContract = useCreateContract();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();

  // Chỉ hỏi ngữ cảnh bàn giao khi đơn CÒN SỐNG — đơn đã khép thì không chiều nào mở được nữa.
  const closed = isBookingFinal(status);
  // Như web: đơn đã khép vẫn cần ngữ cảnh để hiện lối "Ảnh bàn giao" cho biên bản đã có.
  const handovers = useHandoverContext(booking.id, permissions.has(PERMISSION.HANDOVER_VIEW));
  const context = handovers.data;

  const canViewHandover = permissions.has(PERMISSION.HANDOVER_VIEW);
  const canManageHandover = permissions.has(PERMISSION.HANDOVER_MANAGE);
  const canUpdate = permissions.has(PERMISSION.BOOKING_UPDATE);
  const canRecordPayment = permissions.has(PERMISSION.PAYMENT_RECORD);
  const canConfirmHandover = permissions.has(PERMISSION.HANDOVER_CONFIRM);
  /*
   * Hai trục nối tiếp (ADR 0027 điều 2), đúng web `BookingActionBar`: chủ xe tuyến hoa hồng mang
   * ĐỦ quyền `shop_owner`, nên chỉ hỏi quyền là bày cho họ Hợp đồng / Lịch sử tiền / Thu tiền —
   * những năng lực của gói (`contracts`, `finance`) họ không có.
   */
  const contractsFeature = useFeature(PLAN_FEATURE.CONTRACTS);
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);

  const hasDebt = !isZeroMoney(booking.debtAmount);
  /** Đã lập biên bản chưa — lối "Ảnh bàn giao" chỉ có nghĩa khi thật sự đã có biên bản. */
  const hasHandover = Boolean(context?.pickup ?? context?.return);

  const tAlert = useTranslations('Bookings.detailPage.handoverAlert');
  const [handoverAlert, setHandoverAlert] = useState<HandoverType | null>(null);
  /** Bản native của `requestHandover` (web): đủ việc thì mở luồng ngay, thiếu thì hỏi lại. */
  const requestHandover = (type: HandoverType) => {
    const prepMissing =
      type === HANDOVER_TYPE.PICKUP && booking.handoverPrep
        ? prepRowStates(booking.handoverPrep, prepCan).some((row) => !row.done)
        : false;
    const slots = missingPhotoSlots(
      type === HANDOVER_TYPE.PICKUP ? context?.pickup?.photos : context?.return?.photos,
      booking.vehicleType,
    );
    if (!prepMissing && slots.length === 0) {
      navigateOnce(ROUTES.manage.handover(booking.id, type));
      return;
    }
    setHandoverAlert(type);
  };

  const cta =
    canViewHandover && context
      ? context.canStartPickup && !context.pickup?.confirmedAt
        ? { label: t('confirmPickup'), type: HANDOVER_TYPE.PICKUP }
        : context.canStartReturn && !context.return?.confirmedAt
          ? { label: t('confirmReturn'), type: HANDOVER_TYPE.RETURN }
          : null
      : null;

  /*
   * Dựng thành MẢNG rồi mới vẽ, thay vì rải `{cond ? <BarAction/> : null}` trong JSX: lưới cần
   * biết TỔNG số nút để chia hàng và căn giữa hàng cuối, mà số nút thì đổi theo quyền và theo
   * việc đã có biên bản hay chưa (ba tới năm nút tuỳ đơn).
   *
   * Thứ tự khớp web từng mục một.
   */
  const actions: BarActionItem[] = [];

  /*
   * Quyết định KHÉP ĐƠN đứng ĐẦU hàng, đúng chỗ web đặt `BookingStatusActions`: chúng là việc
   * phải làm với đơn, phần còn lại của hàng là tra cứu.
   *
   * Nút nào hiện lên hỏi thẳng `canTransitionBooking` thay vì tự liệt kê theo trạng thái: thêm
   * một cạnh vào máy trạng thái ở `@xeprime/types` là thanh này tự đúng theo (ADR 0005).
   */
  if (canUpdate && canTransitionBooking(status, BOOKING_STATUS.CANCELLED)) {
    actions.push({
      label: tStatus('cancel'),
      icon: 'close-circle-outline',
      variant: 'danger',
      onPress: () => onDecide(BOOKING_STATUS.CANCELLED),
    });
  }

  /*
   * Ba điều kiện, và cả ba đều phải đúng — đúng bộ mà server kiểm:
   *   1. máy trạng thái còn cạnh `→ no_show`;
   *   2. đã qua ân hạn `BOOKING_NO_SHOW_GRACE_MINUTES` kể từ giờ nhận theo đơn;
   *   3. CHƯA HỀ giao xe — có biên bản giao đã xác nhận thì khách đã cầm chìa khoá, gọi họ là
   *      "không đến" vừa sai sự thật vừa nhả lịch một chiếc xe đang chạy ngoài đường.
   *
   * Điều kiện thứ ba là thứ app còn thiếu so với web.
   */
  if (
    canUpdate &&
    canTransitionBooking(status, BOOKING_STATUS.NO_SHOW) &&
    isNoShowGracePassed(booking.pickupAt) &&
    !context?.pickup?.confirmedAt
  ) {
    actions.push({
      label: tStatus('noShow'),
      icon: 'person-remove-outline',
      onPress: () => onDecide(BOOKING_STATUS.NO_SHOW),
    });
  }

  /*
   * "Hợp đồng" — tạo (hoặc lấy) rồi mở trang của nó, đúng luồng web.
   *
   * Server idempotent: bấm lại trả đúng bản cũ chứ không lập bản thứ hai, nên không cần hỏi
   * "đã có hợp đồng chưa" trước khi bấm. Gate `contracts.manage` như web.
   */
  if (permissions.has(PERMISSION.CONTRACT_MANAGE) && contractsFeature.isVisible) {
    actions.push({
      label: t('contract'),
      icon: 'document-attach-outline',
      disabled: createContract.isPending,
      onPress: () =>
        createContract.mutate(booking.id, {
          onSuccess: (contract) => navigateOnce(ROUTES.manage.contract(contract.id)),
          onError: (error) => toast.showError(errorMessage(error)),
        }),
    });
  }

  /*
   * "Lịch sử tiền" chứ không phải "Sổ tiền của đơn": nó liệt kê các lần thu và các phiếu của
   * ĐƠN, còn "sổ" là cuốn Thu-Chi của cả gian hàng — hai thứ khác nhau mà gọi cùng một chữ thì
   * người dùng tưởng mình mở nhầm chỗ.
   */
  // Web gác CHỈ bằng năng lực `finance` (đọc lịch sử tiền của đơn không cần quyền ghi).
  if (financeFeature.isVisible) {
    actions.push({
      label: t('moneyHistory'),
      icon: 'receipt-outline',
      onPress: () => navigateOnce(ROUTES.manage.payments(booking.id)),
    });
  }

  if (canUpdate) {
    actions.push({
      label: t('edit'),
      icon: 'create-outline',
      /*
       * Đơn đã khép thì server từ chối mọi lần ghi. Nút vẫn ĐỨNG NGUYÊN CHỖ nhưng mờ đi — biến
       * mất thì hàng nút nhảy chỗ giữa các đơn, còn để bấm được thì người dùng ăn 409 mà không
       * hiểu vì sao. Cùng quyết định với web.
       */
      disabled: closed,
      onPress: onEdit,
    });
  }

  if (canRecordPayment && financeFeature.isVisible) {
    actions.push({
      // Hết nợ thì nút vẫn đứng nguyên chỗ nhưng nói rõ là không còn gì để thu.
      label: hasDebt ? t('collect') : t('collected'),
      icon: 'cash-outline',
      disabled: !hasDebt,
      /*
       * MỞ TẤM TRƯỢT ngay tại đây, không đẩy sang màn lịch sử — đúng như web mở
       * `RecordPaymentModal`. Số còn nợ đang nằm ngay trên màn này, nên form điền sẵn được;
       * đẩy sang một màn khác là bắt người dùng nhớ con số rồi gõ lại.
       */
      onPress: () => setCollecting(true),
    });
  }

  /*
   * Lối BỔ SUNG ảnh cho biên bản ĐÃ lập. Luồng nhanh cho xác nhận trong một cú bấm nên quên
   * đính ảnh là chuyện thường ngày — không có lối này thì bằng chứng nằm lại trong điện thoại
   * nhân viên mãi mãi. Chỉ hiện khi thật sự đã có biên bản.
   */
  if (canManageHandover && hasHandover) {
    actions.push({
      label: t('handoverPhotos'),
      icon: 'images-outline',
      onPress: () => navigateOnce(ROUTES.manage.handoverPhotos(booking.id)),
    });
  }

  return (
    /*
      Một THẺ như mọi khối khác của màn, không phải một lớp nổi: nó nằm trong dòng nội dung nên
      không cần bóng, không cần viền gold, không cần safe-area đáy — `Screen` đã giữ cạnh đó.
    */
    <Card>
      <YStack gap={space.sm}>
        {/*
        CTA chính đứng TRÊN hàng phụ, ngược thứ tự web (web để nó bên phải cùng hàng).
        Trên điện thoại hàng dọc: thứ quan trọng nhất phải gần ngón cái nhất, và nó là dòng
        người dùng chạm tới trước khi mắt kịp đọc hết hàng phụ.
      */}
        {cta ? (
          <Button
            label={cta.label}
            size="lg"
            // Thiếu `handovers.confirm` thì nút đứng đó nhưng mờ kèm lời giải thích — đúng web,
            // thay vì bấm được rồi ăn 403.
            disabled={!canConfirmHandover}
            onPress={() => requestHandover(cta.type)}
          />
        ) : null}
        {cta && !canConfirmHandover ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('confirmPermissionHint')}
          </Text>
        ) : null}

        {/*
          Hàng phụ — CÙNG BỘ và CÙNG THỨ TỰ với `BookingActionBar` của web: Hợp đồng · Lịch sử
          tiền · Sửa đơn · Thu tiền/Đã thu đủ · Ảnh bàn giao. Bày thẳng chứ không giấu sau menu
          ba chấm — đều là việc thường ngày ở quầy.

          KHÔNG có "Quyết toán": web không có, và nó đã có lối vào riêng ngay trên thẻ "Phát
          sinh & Tiền cọc" của chính màn này.
        */}
        <BarActionGrid actions={actions} />

        {closed && canUpdate ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('closedHint')}
          </Text>
        ) : null}
      </YStack>

      {/*
        Cảnh báo "còn thiếu" trước khi bàn giao (web `requestHandover`, 03/11/2026): lượt GIAO soát
        các dòng "Chuẩn bị bàn giao" chưa xong + góc ảnh bắt buộc còn trống; lượt NHẬN chỉ soát ảnh.
        Không chặn — "Vẫn tiếp tục" mở đúng luồng bàn giao.
      */}
      <AlertDialog
        open={handoverAlert !== null}
        title={tAlert('title')}
        message={tAlert(handoverAlert === HANDOVER_TYPE.PICKUP ? 'bodyPickup' : 'bodyReturn')}
        confirmLabel={tAlert('continue')}
        destructive
        onConfirm={() => {
          const type = handoverAlert;
          setHandoverAlert(null);
          if (type) navigateOnce(ROUTES.manage.handover(booking.id, type));
        }}
        onCancel={() => setHandoverAlert(null)}
      />

      {/* Gắn/tháo theo cờ mở: số điền sẵn chỉ đọc lúc dựng. */}
      {collecting ? (
        <RecordPaymentSheet
          open
          onClose={() => setCollecting(false)}
          bookingId={booking.id}
          debtAmount={booking.debtAmount}
        />
      ) : null}
    </Card>
  );
}

interface BarActionItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Mặc định `accent`. `danger` dành cho Hủy đơn — web cũng tô đỏ riêng nút đó. */
  variant?: 'accent' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Bao nhiêu ô một hàng. HAI: nhãn tiếng Việt của nhóm này dài và nút còn mang biểu tượng, nên
 * ba ô một hàng là ô nào cũng phải cắt chữ. Năm nút vì thế xếp 2 · 2 · 1, hàng lẻ nằm giữa.
 */
const BAR_ROW_SIZE = 2;

/**
 * Lưới hành động phụ: cắt thành hàng ba, hàng cuối CĂN GIỮA.
 *
 * Ô rộng theo phần trăm cố định chứ không `flexGrow`: có `flexGrow` thì hàng cuối chỉ còn hai ô
 * sẽ phình mỗi ô lên một nửa bề ngang, và lưới đọc ra như hai nhóm nút khác cỡ nhau. Rộng cố
 * định + `jc="center"` thì mọi ô bằng nhau ở mọi hàng, hàng thiếu chỉ đơn giản là hẹp hơn và
 * nằm giữa.
 */
function BarActionGrid({ actions }: { actions: readonly BarActionItem[] }) {
  const rows: BarActionItem[][] = [];
  for (let i = 0; i < actions.length; i += BAR_ROW_SIZE) {
    rows.push(actions.slice(i, i + BAR_ROW_SIZE));
  }

  return (
    <YStack gap={space.xs}>
      {rows.map((row) => (
        <XStack key={row[0]?.label} jc="center" gap={space.xs}>
          {row.map((item) => (
            <BarAction key={item.label} {...item} />
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

/**
 * Một ô của lưới — một `Button` nền vàng nhạt (`accent`), hạng dưới CTA chính của màn.
 *
 * Ô rộng `48%` chứ không `flexGrow`: có `flexGrow` thì hàng cuối chỉ còn một nút sẽ giãn ra
 * chiếm trọn bề ngang và đọc ra như một hành động chính thứ hai. Rộng cố định thì nút lẻ giữ
 * đúng cỡ của các nút trên nó, chỉ khác là nằm giữa.
 */
function BarAction({ label, icon, variant = 'accent', disabled = false, onPress }: BarActionItem) {
  /* Hai ô + một khe vẫn dưới 100% — xem ghi chú ở docblock ngay trên. */
  return (
    <YStack w="48%">
      <Button
        label={label}
        icon={icon}
        variant={variant}
        size="sm"
        disabled={disabled}
        onPress={onPress}
      />
    </YStack>
  );
}
