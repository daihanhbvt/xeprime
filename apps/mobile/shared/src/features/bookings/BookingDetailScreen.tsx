import { useCallback, useRef, useState, type ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { InfoHint } from '@/components/ui/InfoHint';
import { ActionSheetButtons, type SheetAction } from '@/components/ui/ActionSheetButtons';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { CardTitle } from '@/components/ui/CardTitle';
import { LineIcon } from '@/components/icons/LineIcon';
import { Linking, Pressable, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  canTransitionBooking,
  CANCELLATION_REASON_CATEGORY,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS_META,
  DRIVER_INCIDENT_LEVEL,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  DRIVER_LICENCE_STATE,
  DRIVER_ROSTER_KIND,
  DRIVER_SOURCE,
  isDriverMissingAlertDue,
  isDriverReassignable,
  STATUS_COLOR,
  HANDOVER_TYPE,
  type HandoverType,
  isBookingClosedWithoutTrip,
  isBookingFinal,
  isNoShowGracePassed,
  PERMISSION,
  PLAN_FEATURE,
  SERVICE_TYPE,
  type BookingStatus,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { TOAST_PRESET } from '@/components/feedback/AppToast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { isZeroMoney, LIST_SEPARATOR, telHref } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useCustomerProfileAccess } from '@/features/booking-requests/hooks/use-customer-profile-access';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useNow } from '@/hooks/use-now';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';
import { AssignDriverSheet, type DriverCandidate } from './components/AssignDriverSheet';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Avatar } from '@/components/ui/Avatar';
import { BookingDriverHistory } from './components/BookingDriverHistory';
import { CustomerReturnReport } from './components/CustomerReturnReport';
import {
  CustomerSideCard,
  PaymentSideCard,
  VehicleSideCard,
} from './components/BookingDetailSide';
import { CollateralSideCard } from './components/CollateralSideCard';
import { HandoverPhotosCard } from './components/HandoverPhotosCard';
import { OwnerPayoutTable } from './components/OwnerPayoutTable';
import { SectionCard } from '@/components/ui/SectionCard';
import { BookingStatusSheet, type Decision } from './components/BookingStatusSheet';
import { BookingSettlementCard } from './components/BookingSettlementCard';
import { BookingInsurancePanel } from './components/BookingInsurancePanel';
import { BookingExtensionsPanel } from './components/BookingExtensionsPanel';
import {
  HandoverPrepCard,
  missingPhotoSlots,
  prepCollateralOf,
  prepRowStates,
  prepTitleKey,
} from './components/HandoverPrepCard';
import {
  BookingOutcomeBanner,
  BookingStageChip,
  BookingStepper,
  TripScheduleCard,
} from './components/BookingStageSections';
import { DeliveryFeeSheet } from './components/DeliveryFeeSheet';
import { BookingCustomerDocumentsSheet } from './components/BookingCustomerDocumentsSheet';
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
import { getErrorCode } from '@/lib/api-client';


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

export function BookingDetailScreen({
  bookingId,
  openNoShow = false,
  preview,
}: {
  bookingId: string;
  /** Mã/chặng/ngày tạo truyền qua điều hướng - dựng header đầy đủ ngay khi đang tải. */
  preview?: { code: string; status?: string; createdAt?: string } | undefined;
  /** Mở sẵn tấm "Khách không đến" — từ nút trên thẻ đơn (web mở hộp ngay trên thẻ). */
  openNoShow?: boolean;
}) {
  const t = useTranslations('Bookings.detail');
  const router = useRouter();
  // Web `BookingDetailContent`: thiếu `bookings.view` thì nói thẳng, KHÔNG gọi API.
  const canView = usePermissions().has(PERMISSION.BOOKING_VIEW);
  const query = useBooking(bookingId, canView);

  const back = () => goBackOr(router, ROUTES.manage.bookings());

  if (!canView) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbiddenTitle')}
            description={t('forbiddenBody')}
          />
        </Screen>
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        {/* LUÔN cùng khung header thật - có/không dữ liệu truyền sang (20/11/2026). */}
        <PreviewHeader preview={preview} onBack={back} />
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
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
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

  return <BookingDetailBody booking={query.data} onBack={back} openNoShow={openNoShow} />;
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

function BookingDetailBody({
  booking,
  onBack,
  openNoShow,
}: {
  booking: BookingDetail;
  onBack: () => void;
  openNoShow: boolean;
}) {
  const colors = useColors();
  const { refreshing, onRefresh } = useBookingRefresh(booking.id);
  const t = useTranslations('Bookings');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  /*
   * Mở sẵn tấm no-show khi đến từ nút trên thẻ — chỉ khi máy trạng thái còn cạnh `→ no_show`;
   * server vẫn là bên chặn cuối (ân hạn, đã giao xe).
   */
  const [decision, setDecision] = useState<Decision | null>(() =>
    openNoShow && canTransitionBooking(booking.status as BookingStatus, BOOKING_STATUS.NO_SHOW)
      ? BOOKING_STATUS.NO_SHOW
      : null,
  );
  const [assigningDriver, setAssigningDriver] = useState(false);
  /** Tài xế NỘI BỘ vừa chọn — chờ xác nhận rồi gán thẳng (ADR 0108, không tiền công). */
  const [pickedInternal, setPickedInternal] = useState<DriverCandidate | null>(null);
  const [editingFee, setEditingFee] = useState(false);
  const [editing, setEditing] = useState(false);
  const [detailTab, setDetailTab] = useState<'prep' | 'trip' | 'extra'>('prep');
  const [docsOpen, setDocsOpen] = useState(false);
  /* Dòng "Nhận tài sản thế chấp" mở ô thêm món của thẻ Cọc & thế chấp rồi cuộn tới thẻ (web). */
  const [collateralAddRequest, setCollateralAddRequest] = useState(0);
  const [collateralCashRequest, setCollateralCashRequest] = useState(0);
  const collateralY = useRef(0);
  /* Nút "Ảnh" của Chuẩn bị bàn giao cuộn tới khối ảnh TRONG trang (web `BookingDetailSections`). */
  const scrollRef = useRef<ScrollView | null>(null);
  const photosY = useRef(0);
  const scrollToPhotos = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, photosY.current - space.md), animated: true });
  }, []);
  const openAddCollateral = useCallback(() => {
    setCollateralAddRequest((n) => n + 1);
    scrollRef.current?.scrollTo({ y: Math.max(0, collateralY.current - space.md), animated: true });
  }, []);
  const openEditCash = useCallback(() => setCollateralCashRequest((n) => n + 1), []);

  const transition = useTransitionBooking(booking.id);
  const assignDriver = useAssignDriver(booking.id);

  const tDriver = useTranslations('Drivers.booking');
  const tWage = useTranslations('Drivers.wage');
  const [confirmingUnassign, setConfirmingUnassign] = useState(false);
  // Tài xế vừa chọn ở bộ chọn — chờ nhập tiền công trong tấm gán (ADR 0075).
  const [pickedDriver, setPickedDriver] = useState<{
    id: string;
    name: string;
    licenceState: string | null;
  } | null>(null);
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
  const closed = isBookingFinal(status);
  // Đơn huỷ / khách không đến: không ghi tiền MỚI (server `BOOKING_MONEY_CLOSED`), như web.
  const moneyClosed = isBookingClosedWithoutTrip(status);

  const canUpdate = permissions.has(PERMISSION.BOOKING_UPDATE);
  // Cổng của khối "Chuẩn bị bàn giao" — cùng `can` của web (BookingDetailActions).
  const prepFinance = useFeature(PLAN_FEATURE.FINANCE);
  // Hợp đồng của đơn thuộc bộ CƠ BẢN từ 20/11/2026 (ADR 0027 sửa điều 1, SR-245) - chỉ xét quyền.
  const prepCan = {
    collect: permissions.has(PERMISSION.PAYMENT_RECORD) && prepFinance.isVisible && !moneyClosed,
    contract: permissions.has(PERMISSION.CONTRACT_MANAGE),
    markPrep: permissions.has(PERMISSION.HANDOVER_MANAGE) && !closed,
    documents:
      Boolean(booking.tenantCustomerId) && permissions.has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE),
    managePhotos: permissions.has(PERMISSION.HANDOVER_MANAGE),
  };
  const withDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const handoverCta = useHandoverCta(booking, prepCan);
  const canViewVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);
  /** Sổ khách: quyền + tuyến gói (ADR 0056) — như web `canViewCustomer`. */
  const customerProfileAccess = useCustomerProfileAccess();
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
  // Tài xế nội bộ (ADR 0108): đã nhận ngay như tài xế ngoài hệ thống, nhưng chọn từ danh bạ.
  const isInternalDriver = driver?.source === DRIVER_SOURCE.INTERNAL;
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
  function confirmDecision(input: { reason?: string; reasonCategory?: CancellationReasonCategory }) {
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

  /* Figma "Chi tiết đơn" `24158:103509`: Huỷ + nút bàn giao DÍNH ĐÁY; "Khách không đến" cuối nội dung. */
  const cancelButton = canCancelBooking ? (
    <Button
      label={t('statusActions.cancel')}
      variant="dangerOutline"
      block={false}
      onPress={() => setDecision(BOOKING_STATUS.CANCELLED)}
    />
  ) : null;
  const handoverButton =
    handoverCta.cta && permissions.has(PERMISSION.HANDOVER_CONFIRM) ? (
      <Button
        label={handoverCta.cta.label}
        variant="gradient"
        onPress={() => handoverCta.request(handoverCta.cta!.type)}
      />
    ) : null;
  const noShowButton =
    canUpdate &&
    canTransitionBooking(status, BOOKING_STATUS.NO_SHOW) &&
    isNoShowGracePassed(booking.pickupAt) &&
    !handoverCta.pickupConfirmed ? (
      <Button
        label={t('statusActions.noShow')}
        variant="secondary"
        onPress={() => setDecision(BOOKING_STATUS.NO_SHOW)}
      />
    ) : null;

  return (
    <>
      {/* Web `ManagePageHeader` của trang chi tiết: "Chi tiết đơn · #mã" + nút quay lại. */}
      {/* Figma "Page Header" `24145:102197`: ← tiêu đề, "Tạo lúc" + viên chặng, thanh 4 bước. */}
      <ManagePageHeader
        // App: "Chi tiết đơn #mã" như Figma (không dấu ·); web giữ `detailPage.title`.
        title={t('detailPage.partnerApp.title', { code: booking.code })}
        onBack={onBack}
        subtitle={
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1} flexShrink={1}>
              {t('detailPage.createdAt', { date: fmt.date(booking.createdAt) })}
            </Text>
            <BookingStageChip status={status} cancellationParty={booking.cancellationParty} />
          </XStack>
        }
        below={<BookingStepper booking={booking} variant="bar" />}
        actions={<BookingActionsMenu booking={booking} />}
      />
      {handoverCta.alert}
      <Screen
        edges={['left', 'right', 'bottom']}
        {...(cancelButton || handoverButton
          ? { footer: <StickyActionBar secondary={cancelButton} primary={handoverButton} /> }
          : {})}
        scrollRef={scrollRef}
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/*
          Web `BookingDetailBody` khổ hẹp: MỘT cột, khe `space-md`; cột phải (xe · tài xế · khách ·
          thanh toán · hành động) lên TRƯỚC cột chính (`.side { order: -1 }`).
        */}
        <YStack gap={space.md}>
          {/* Đầu trang: chip chặng + "Tạo lúc" (web `ManagePageHeader title/subtitle`) rồi cụm nút. */}


          <VehicleSideCard
            booking={booking}
            onOpenVehicle={
              canViewVehicle
                ? () => navigateOnce(ROUTES.manage.vehicleDetail(booking.vehicleId))
                : undefined
            }
            onOpenSchedule={
              canViewVehicle
                ? () =>
                    navigateOnce(
                      vehicleSchedulePath(
                        { name: booking.vehicleName, plateNumber: booking.vehiclePlate },
                        { back: true },
                      ),
                    )
                : undefined
            }
          />

          {/*
            Khối "Tài xế" (ADR 0063) — gương `BookingDriverSection` của web: chỉ đơn `with_driver`
            có tài xế; đơn khác ẩn hẳn khối, trừ khi còn một tài xế gán từ trước (chỉ-đọc, để không
            ai mất dấu người đang cầm xe). Gán xong là "chờ tài xế nhận" tới khi họ nhận ở app khách.
          */}
          {withDriver || booking.driver ? (
            <Card>
              <YStack gap={space.sm}>
                <CardTitle icon="person-outline">{t('driver.title')}</CardTitle>

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
                    {/* Ảnh tài khoản (liên kết) / ảnh danh bạ (nội bộ) — web `BookingDriverSection`. */}
                    <Avatar name={booking.driver.name} url={booking.driver.avatarUrl ?? null} size={36} />
                    <YStack f={1} gap={2} minWidth={0}>
                      <XStack ai="center" gap={space.xs} flexWrap="wrap">
                        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                          {booking.driver.name}
                        </Text>
                        {isInternalDriver || isExternalDriver ? (
                          <StatusBadge
                            label={tDriver(isInternalDriver ? 'internalTag' : 'externalTag')}
                            color={STATUS_COLOR.NEUTRAL}
                            size="sm"
                          />
                        ) : (
                          <>
                          {/* Bằng lái của tài xế liên kết (web `SourceBadge`) — đối chiếu lúc giao xe. */}
                          {booking.driver.licence ? (
                            <StatusBadge
                              size="sm"
                              color={
                                booking.driver.licence.state === DRIVER_LICENCE_STATE.VERIFIED
                                  ? STATUS_COLOR.SUCCESS
                                  : STATUS_COLOR.DANGER
                              }
                              label={
                                booking.driver.licence.state === DRIVER_LICENCE_STATE.VERIFIED
                                  ? booking.driver.licence.classes.length > 0
                                    ? tDriver('card.licence', {
                                        classes: booking.driver.licence.classes.join(', '),
                                      })
                                    : tDriver('card.licenceVerified')
                                  : tDriver('card.licenceUnverified')
                              }
                            />
                          ) : null}
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
                          </>
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
                        {isExternalDriver || isInternalDriver
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
                      {isInternalDriver ? (
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {tDriver('card.internalNoWage')}
                        </Text>
                      ) : openAssignment ? (
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

          {/*
            Thẻ KHÁCH như Figma: tên (bấm mở hồ sơ khách khi có quyền) · "Khách quen" · SĐT · bút Sửa
            đơn. Giấy tờ khách vào từ dòng "Bổ sung giấy tờ của khách" ở tab Chuẩn bị (20/11/2026).
          */}
          <CustomerSideCard
            booking={booking}
            onEdit={canUpdate && !closed ? () => setEditing(true) : undefined}
            onViewProfile={
              booking.tenantCustomerId && customerProfileAccess
                ? () => navigateOnce(ROUTES.manage.customerDetail(booking.tenantCustomerId as string))
                : undefined
            }
          />

          {/* Cọc tiền + tài sản thế chấp theo đơn (ADR 0109) — tự ẩn khi không có gì để giữ. */}
          <YStack
            onLayout={(event) => {
              collateralY.current = event.nativeEvent.layout.y;
            }}
          >
            <CollateralSideCard
              booking={booking}
              addRequest={collateralAddRequest}
              cashRequest={collateralCashRequest}
            />
          </YStack>

          <PaymentSideCard
            booking={booking}
            onEditFee={canUpdate && !closed ? () => setEditingFee(true) : undefined}
          />
          {/* Lợi nhuận chuyến đứng riêng ngay sau Thanh toán như cột phải của web (16/11/2026). */}
            {booking.ownerPayout ? (
              <SectionCard
                title={t('detailPage.profit.title')}
                // "Số đã chốt lúc đặt…" thành dấu "i" cạnh tiêu đề (người dùng 20/11/2026).
                extra={
                  <InfoHint
                    content={t('money.ownerEconomics.note')}
                    label={t('detailPage.profit.title')}
                    size={fontSize.body}
                  />
                }
              >
                <OwnerPayoutTable
                  payout={booking.ownerPayout}
                  label={t('detailPage.profit.title')}
                  // Figma "Lợi nhuận chuyến" `24512:131124` (người dùng chốt 20/11/2026): đủ dòng, style v2.
                  variant="v2"
                />
              </SectionCard>
            ) : null}
          {/* Figma: "Bảo hiểm chuyến đi" đứng ngay sau Lợi nhuận chuyến, ngoài các tab (20/11/2026). */}
          <BookingInsurancePanel bookingId={booking.id} />

          <BookingOutcomeBanner booking={booking} />
          {/*
            Thẻ các bước có chấm đã gỡ (người dùng chốt 20/11/2026): trùng thanh 4 bước ở đầu màn,
            Figma không vẽ. Mốc giờ giao/nhận vẫn ở tab "Chuyến & thời gian".
          */}
          {/*
            Figma thẻ 3 tab `24158:102976`: Chuẩn bị (việc bàn giao) · Chuyến & thời gian (lịch,
            gia hạn) · Phát sinh (quyết toán, bảo hiểm, lợi nhuận). Mọi khối cũ vẫn còn, chỉ xếp lại.
          */}
          <Card>
            <YStack gap={space.md}>
              <SegmentedTabs
                variant="neutral"
                fit
                items={[
                  { key: 'prep', label: t('detailPage.tabs.prep') },
                  { key: 'trip', label: t('detailPage.tabs.trip') },
                  { key: 'extra', label: t('detailPage.tabs.extra') },
                ]}
                value={detailTab}
                onChange={setDetailTab}
              />
              {detailTab === 'prep' ? (
                <HandoverPrepCard
                  embedded
                  booking={booking}
                  can={prepCan}
                  onDocuments={() => setDocsOpen(true)}
                  onPhotos={scrollToPhotos}
                  onAddCollateral={openAddCollateral}
                  onEditCash={openEditCash}
                />
              ) : detailTab === 'trip' ? (
                <YStack gap={space.md}>
                  <TripScheduleCard booking={booking} />
                  <BookingExtensionsPanel booking={booking} />
                </YStack>
              ) : (
                <YStack gap={space.md}>
                  <BookingSettlementCard bookingId={booking.id} moneyClosed={moneyClosed} />
                </YStack>
              )}
            </YStack>
          </Card>
          <YStack
            onLayout={(event) => {
              photosY.current = event.nativeEvent.layout.y;
            }}
          >
            <HandoverPhotosCard booking={booking} closed={closed} />
          </YStack>
          {/* Nút hành động chính của chặng (huỷ · giao/nhận xe) ở CUỐI trang (người dùng 16/11/2026). */}
          {/*
            Web `SideActions`: lời báo trả xe của khách (ADR 0081) rồi MỘT hàng "Hủy đơn" (trái) ·
            nút bàn giao (phải, gấp đôi); "Khách không đến" xuống hàng dưới; một nút thì cả hàng.
          */}
          <YStack gap={GAP_12}>
            <CustomerReturnReport
              booking={booking}
              canDispute={permissions.has(PERMISSION.HANDOVER_CONFIRM)}
            />
            {noShowButton}
          </YStack>
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
        onSelect={(candidate) => {
          setAssigningDriver(false);
          if (candidate.kind === DRIVER_ROSTER_KIND.INTERNAL) {
            setPickedInternal(candidate);
            return;
          }
          // Tài xế liên kết qua tấm gán KÈM tiền công (ADR 0075) — như hộp gán của web.
          setPickedDriver({
            id: candidate.id,
            name: candidate.name,
            licenceState: candidate.licenceState,
          });
        }}
      />

      {/* Tài xế nội bộ: gán thẳng, coi như đã nhận, không tiền công (web `ChangeDriverDialog`). */}
      <ConfirmSheet
        open={pickedInternal !== null}
        title={booking.driver ? tDriver('picker.confirmChange') : tDriver('picker.confirmAssign')}
        {...(pickedInternal
          ? { subtitle: `${pickedInternal.name}${LIST_SEPARATOR}${pickedInternal.phone}` }
          : {})}
        message={tDriver('picker.internalNote')}
        confirmLabel={booking.driver ? tDriver('picker.confirmChange') : tDriver('picker.confirmAssign')}
        tone="primary"
        loading={assignDriver.isPending}
        onClose={() => setPickedInternal(null)}
        onConfirm={() => {
          const chosen = pickedInternal;
          if (!chosen || assignDriver.isPending) return;
          assignDriver.mutate(
            { internalDriverId: chosen.id },
            {
              onSuccess: () => {
                toast.showSuccess(tDriver('internalAssigned'));
                setPickedInternal(null);
              },
              onError: (err) => toast.showError(errorMessage(err)),
            },
          );
        }}
      />

      {/* Mount có điều kiện: mỗi lần mở là một form mới, không mang lượt nhập dở sang. */}
      {pickedDriver ? (
        <AssignDriverWageSheet
          bookingId={booking.id}
          driver={pickedDriver}
          pickupAt={booking.pickupAt}
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
      {booking.tenantCustomerId ? (
        <BookingCustomerDocumentsSheet
          customerId={booking.tenantCustomerId}
          customerName={booking.customerName}
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
        />
      ) : null}

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

/**
 * Nút bàn giao CHÍNH ("Xác nhận giao xe" / "Xác nhận nhận xe") - tách khỏi `BookingActionBar` để
 * đứng ở THANH DÍNH ĐÁY như thanh CTA của app khách (người dùng chốt 10/11/2026). Logic giữ nguyên
 * bản cũ: cùng điều kiện hiện, cùng cảnh báo "còn thiếu" của web `requestHandover`.
 */
function useHandoverCta(
  booking: BookingDetail,
  prepCan: { collect: boolean; contract: boolean },
): {
  cta: { label: string; type: HandoverType } | null;
  request: (type: HandoverType) => void;
  alert: ReactNode;
  pickupConfirmed: boolean;
} {
  const t = useTranslations('Bookings.actionBar');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const handovers = useHandoverContext(booking.id, permissions.has(PERMISSION.HANDOVER_VIEW));
  const context = handovers.data;
  const canViewHandover = permissions.has(PERMISSION.HANDOVER_VIEW);
  const tAlert = useTranslations('Bookings.detailPage.handoverAlert');
  const tPrep = useTranslations('Bookings.detailPage.prep');
  const slotLabel = useDomainLabel();
  const toast = useAppToast();
  const fmt = useAppFormat();
  /** Lượt cảnh báo: chiều bàn giao + ĐÚNG những việc còn thiếu (web tô đỏ từng dòng/góc ảnh). */
  const [handoverAlert, setHandoverAlert] = useState<{ type: HandoverType; missing: string[] } | null>(
    null,
  );
  /** Bản native của `requestHandover` (web): đủ việc thì mở luồng ngay, thiếu thì hỏi lại. */
  const requestHandover = (type: HandoverType) => {
    /*
     * Nhận lại xe (06/11/2026, PR #278): màn "Xác nhận đã nhận lại xe" tự chụp ảnh và đếm x/N ảnh
     * ngay trong thân — cảnh báo "còn thiếu" chỉ còn cho chiều giao xe, như web.
     */
    if (type === HANDOVER_TYPE.RETURN) {
      navigateOnce(ROUTES.manage.handover(booking.id, type));
      return;
    }
    /*
     * Giao xe chỉ mở từ 60′ trước giờ nhận (ADR 0104 điều 1 - web `requestHandover`). Nói giờ mở NGAY
     * ở cú bấm thay vì mở luồng rồi để server từ chối sau khi chủ xe đã điền xong. Server vẫn là cửa chặn thật.
     */
    const opensAt = context?.pickupConfirmOpensAt;
    if (opensAt && Date.now() < new Date(opensAt).getTime()) {
      toast.showNotice({
        title: t('pickupNotOpen', { time: fmt.dateTime(opensAt) }),
        tone: TOAST_PRESET.WARNING,
      });
      return;
    }
    const prepMissing = booking.handoverPrep
      ? prepRowStates(booking.handoverPrep, prepCan, prepCollateralOf(booking))
          .filter((row) => !row.done)
          .map((row) => tPrep(prepTitleKey(row.key)))
      : [];
    const slots = missingPhotoSlots(context?.pickup?.photos, booking.vehicleType);
    if (prepMissing.length === 0 && slots.length === 0) {
      navigateOnce(ROUTES.manage.handover(booking.id, type));
      return;
    }
    setHandoverAlert({
      type,
      missing: [
        ...prepMissing,
        ...slots.map((slot) => `${tPrep('photos')}: ${slotLabel('handoverPhotoSlot', slot)}`),
      ],
    });
  };

  const cta =
    canViewHandover && context
      ? context.canStartPickup && !context.pickup?.confirmedAt
        ? { label: t('confirmPickup'), type: HANDOVER_TYPE.PICKUP }
        : context.canStartReturn && !context.return?.confirmedAt
          ? { label: t('confirmReturn'), type: HANDOVER_TYPE.RETURN }
          : null
      : null;


  const alert = (
    <>
      {/*
        Cảnh báo "còn thiếu" trước khi bàn giao (web `requestHandover`, 03/11/2026): lượt GIAO soát
        các dòng "Chuẩn bị bàn giao" chưa xong + góc ảnh bắt buộc còn trống; lượt NHẬN chỉ soát ảnh.
        Không chặn — "Vẫn tiếp tục" mở đúng luồng bàn giao.
      */}
      <AlertDialog
        open={handoverAlert !== null}
        title={tAlert('title')}
        message={[
          tAlert('bodyPickup'),
          ...(handoverAlert?.missing ?? []).map((item) => `- ${item}`),
        ].join(ALERT_LINE_BREAK)}
        confirmLabel={tAlert('continue')}
        destructive
        onConfirm={() => {
          const type = handoverAlert?.type;
          setHandoverAlert(null);
          if (type) navigateOnce(ROUTES.manage.handover(booking.id, type));
        }}
        onCancel={() => setHandoverAlert(null)}
      />

    </>
  );
  return {
    cta,
    request: requestHandover,
    alert,
    pickupConfirmed: Boolean(context?.pickup?.confirmedAt),
  };
}

/**
 * Cụm nút đầu trang — web `HeaderActions`: Hợp đồng (xem/tạo) · Lịch sử thu tiền · Thu tiền, đều
 * theo quyền + năng lực gói (ADR 0027 điều 2). "Sửa" nằm ở thẻ khách, ảnh bàn giao là một khối
 * ngay trong trang — như web.
 */
function BookingHeaderActions({
  booking,
  onDone,
}: {
  booking: BookingDetail;
  onDone?: () => void;
}) {
  const t = useTranslations('Bookings.detailPage.actions');
  const [collecting, setCollecting] = useState(false);
  const createContract = useCreateContract();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const moneyClosed = isBookingClosedWithoutTrip(booking.status as BookingStatus);

  const can = {
    contract: permissions.has(PERMISSION.CONTRACT_MANAGE),
    history: financeFeature.isVisible,
    collect: permissions.has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible && !moneyClosed,
  };
  if (!can.contract && !can.history && !can.collect) return null;
  // Cùng số với tấm Thu tiền và ô "Còn phải thu của khách" (web, ADR 0101): phần `D` khách đã trả
  // trước qua XePrime không còn là việc phải thu ở quầy.
  const hasDebt = !isZeroMoney(booking.counterDueAmount);
  const contractKnown = booking.handoverPrep ? booking.handoverPrep.contractId !== null : true;

  // Figma "Thao tác" `24273:89851`: hợp đồng + lịch sử thu tiền là nút phụ, "Thu tiền" là nút chính.
  const actions: SheetAction[] = [
    ...(can.contract
      ? [
          {
            key: 'contract',
            icon: 'doc-align-left-6' as const,
            label: contractKnown ? t('viewContract') : t('createContract'),
            loading: createContract.isPending,
            onPress: () =>
              createContract.mutate(booking.id, {
                onSuccess: (contract) => {
                  onDone?.();
                  navigateOnce(ROUTES.manage.contract(contract.id));
                },
                onError: (error) => toast.showError(errorMessage(error)),
              }),
          },
        ]
      : []),
    ...(can.history
      ? [
          {
            key: 'history',
            icon: 'doc-align-right-10' as const,
            label: t('moneyHistory'),
            onPress: () => {
              onDone?.();
              navigateOnce(ROUTES.manage.payments(booking.id));
            },
          },
        ]
      : []),
    ...(can.collect
      ? [
          {
            key: 'collect',
            icon: 'dollar-circle' as const,
            label: hasDebt ? t('collect') : t('collected'),
            primary: true,
            disabled: !hasDebt,
            onPress: () => setCollecting(true),
          },
        ]
      : []),
  ];

  return (
    <>
    <ActionSheetButtons actions={actions} />
    {/* Gắn/tháo theo cờ mở: số điền sẵn chỉ đọc lúc dựng. */}
    {collecting ? (
      <RecordPaymentSheet
        open
        onClose={() => setCollecting(false)}
        bookingId={booking.id}
        debtAmount={booking.counterDueAmount}
        counterDue
      />
    ) : null}
    </>
  );
}

/**
 * Hàng nút cuối cột phải — web `.sideActionsRow`: lưới 1 : 2, khe 8. Nút bàn giao luôn ở ô PHẢI
 * hàng đầu; "Hủy đơn" lấp ô trái; nút phụ thứ hai xuống hàng dưới. Một nút duy nhất ⇒ cả hàng.
 */
function SideActionsRow({
  secondary,
  primary,
}: {
  secondary: readonly ReactNode[];
  primary: ReactNode;
}) {
  const cells = [...secondary, ...(primary ? [primary] : [])];
  if (cells.length === 0) return null;
  if (cells.length === 1) return <YStack>{cells[0]}</YStack>;
  const [first, second] = secondary;
  return (
    <YStack gap={space.sm}>
      <XStack gap={space.sm}>
        <YStack f={1} minWidth={0}>
          {first}
        </YStack>
        <YStack f={2} minWidth={0}>
          {primary ?? second}
        </YStack>
      </XStack>
      {/* Nút phụ thứ hai ("Ghi nhận khách không đến") trải cả hàng - ô 1/3 cắt mất chữ. */}
      {primary && second ? <YStack>{second}</YStack> : null}
    </YStack>
  );
}

/** Web `--xp-space-12` (`.sideActions { gap }`). */
const GAP_12 = 12;

/** Mỗi việc còn thiếu một dòng trong hộp cảnh báo bàn giao. */
const ALERT_LINE_BREAK = String.fromCharCode(10);

/**
 * Nút ⋮ trên thanh đầu (Figma "Thao tác"): mở tấm chứa các thao tác phụ của đơn - hợp đồng, lịch sử
 * thu tiền, thu tiền. Cùng cổng quyền / cờ như hàng nút cũ (`BookingHeaderActions`).
 */
function BookingActionsMenu({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.detailPage.actions');
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Figma: dấu ⋮ trơn, không viền/nền. */}
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t('menuTitle')} hitSlop={12}>
        <LineIcon name="menu-kebab" size={20} color={colors.textMuted} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('menuTitle')} chrome="v2" headerDivider>
        <BookingHeaderActions booking={booking} onDone={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}

/**
 * Header ĐẦY ĐỦ dựng từ dữ liệu truyền qua điều hướng trong lúc chi tiết đơn đang tải - cùng khung
 * với header thật (tiêu đề "Chi tiết đơn #mã", "Tạo lúc" + viên chặng, chỗ thanh bước), nên khi dữ
 * liệu về màn không nhảy từ header nhỏ sang header to (người dùng 20/11/2026).
 */
function PreviewHeader({
  preview,
  onBack,
}: {
  preview: { code: string; status?: string; createdAt?: string } | undefined;
  onBack: () => void;
}) {
  const t = useTranslations('Bookings');
  const colors = useColors();
  const fmt = useAppFormat();
  return (
    <ManagePageHeader
      title={
        preview ? t('detailPage.partnerApp.title', { code: preview.code }) : t('detailPage.partnerApp.titleLoading')
      }
      onBack={onBack}
      subtitle={
        <XStack ai="center" jc="space-between" gap={space.sm} minHeight={typeScale.body.lineHeight}>
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1} flexShrink={1}>
            {preview?.createdAt ? t('detailPage.createdAt', { date: fmt.date(preview.createdAt) }) : ''}
          </Text>
          {preview?.status ? <BookingStageChip status={preview.status} /> : null}
        </XStack>
      }
      below={
        // Cùng chiều cao thanh bước thật (vạch 4 + cách 6 + nhãn 14) - không nhảy khi dữ liệu về.
        <YStack h={PREVIEW_STEPPER_H}>
          <Skeleton height={4} />
        </YStack>
      }
    />
  );
}

/** Chỗ của thanh 4 bước khi đang tải. */
const PREVIEW_STEPPER_H = 24;
