import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  canTransitionBooking,
  HANDOVER_TYPE,
  isBookingFinal,
  isNoShowGracePassed,
  PERMISSION,
  SERVICE_TYPE,
  type BookingStatus,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { isZeroMoney, toAppTz } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { AssignDriverSheet } from './components/AssignDriverSheet';
import { BookingMoneyCard } from './components/BookingMoneyCard';
import { BookingStatusSheet, type Decision } from './components/BookingStatusSheet';
import { BookingSettlementCard } from './components/BookingSettlementCard';
import { BookingTripCard } from './components/BookingTripCard';
import { DeliveryFeeSheet } from './components/DeliveryFeeSheet';
import { EditBookingSheet } from './components/EditBookingSheet';
import {
  useAssignDriver,
  useBooking,
  useTransitionBooking,
  useUpdateDeliveryFee,
} from './hooks/use-bookings';
import type { BookingDetail } from './api';

/** Ảnh xe: tỉ lệ cố định để hàng thẳng dù ảnh nguồn dọc hay ngang — cùng cách thẻ hộp thư làm. */
const VEHICLE_IMAGE = { width: 96, height: 72 } as const;

/* `Image` của React Native cần style phẳng — Tamagui không có primitive ảnh thay thế. */
const styles = StyleSheet.create({
  vehicleImage: {
    width: VEHICLE_IMAGE.width,
    height: VEHICLE_IMAGE.height,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

/** Nhãn của một KHỐI trong thẻ chi tiết — nhỏ, viết hoa, mờ. Cùng vai `blockTitle` của web. */
function BlockTitle({ children }: { children: string }) {
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
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={t('errorTitle')}
            onRetry={() => void query.refetch()}
          />
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
  const { refreshing, onRefresh } = useBookingRefresh(booking.id);
  const t = useTranslations('Bookings');
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
  const updateFee = useUpdateDeliveryFee(booking.id);

  const status = booking.status as BookingStatus;
  const meta = BOOKING_STATUS_META[status];
  const closed = isBookingFinal(status);

  const canUpdate = permissions.has(PERMISSION.BOOKING_UPDATE);
  const withDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;

  function confirmDecision(reason: string) {
    if (!decision) return;
    transition.mutate(
      { status: decision, reason },
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
                  label={domainLabel('bookingStatus', status, meta.label)}
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
          />

          {/*
            Khối Tài xế hiện trên MỌI đơn, không chỉ đơn `with_driver` — đúng như
            `BookingDriverSection` của web, vốn không có nhánh nào chặn theo `serviceType`.

            Gate theo `withDriver` là lệch nghiệp vụ: backend cho gán tài xế cho bất kỳ đơn nào
            (giao xe tận nơi vẫn cần người lái đi giao), nên ẩn khối đi là khoá một việc server
            vẫn cho phép. `withDriver` chỉ quyết định có hiện thêm dòng lộ trình hay không.
          */}
          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('driver.title')}
              </Text>
              {/*
                Nút gán/đổi đứng NGAY CẠNH tên tài xế, không nằm một hàng riêng bên dưới: nó thao
                tác đúng dòng đó, và một nút chiếm trọn bề ngang cho một việc hiếm làm khối này
                cao gấp rưỡi mà không thêm thông tin nào.
              */}
              <XStack ai="center" gap={space.sm}>
                <Ionicons
                  name="person-circle-outline"
                  size={iconSize.lg}
                  color={colors.textMuted}
                />
                <YStack f={1} gap={1}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {/*
                      Chưa phân công mà đơn CÓ TÀI XẾ thì câu phải nói ra điều đó — đơn thiếu
                      người lái là một việc còn treo, khác hẳn một đơn tự lái vốn không cần ai.
                      Web tách hai câu đúng ở chỗ này.
                    */}
                    {booking.driver
                      ? booking.driver.name
                      : withDriver
                        ? t('driver.noneWithDriver')
                        : t('driver.none')}
                  </Text>
                  {/*
                    SĐT tách dòng và IN ĐẬM: đây là con số người trực đọc để gọi, không phải một
                    chú thích. Gộp chung dòng với tên bằng dấu "·" thì nó chìm vào tên.
                  */}
                  {booking.driver?.phone ? (
                    <Pressable
                      onPress={() => void Linking.openURL(`tel:${booking.driver?.phone}`)}
                      accessibilityRole="button"
                      accessibilityLabel={booking.driver.phone}
                    >
                      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.bold}>
                        {booking.driver.phone}
                      </Text>
                    </Pressable>
                  ) : null}
                </YStack>
                {canUpdate && !closed ? (
                  <Button
                    label={booking.driver ? t('driver.change') : t('driver.assign')}
                    variant="secondary"
                    block={false}
                    onPress={() => setAssigningDriver(true)}
                  />
                ) : null}
              </XStack>
            </YStack>
          </Card>

          <BookingTripCard bookingId={booking.id} bookingStatus={status} />

          <BookingSettlementCard bookingId={booking.id} />
        </YStack>
      </Screen>

      {decision ? (
        <BookingStatusSheet
          open
          onClose={() => setDecision(null)}
          booking={booking}
          decision={decision}
          onConfirm={confirmDecision}
          loading={transition.isPending}
        />
      ) : null}

      <AssignDriverSheet
        open={assigningDriver}
        onClose={() => setAssigningDriver(false)}
        booking={booking}
        loading={assignDriver.isPending}
        onSelect={(driverId) =>
          assignDriver.mutate(driverId, {
            onSuccess: () => {
              toast.showSuccess(t('driver.assignSuccess'));
              setAssigningDriver(false);
            },
            onError: (error) => toast.showError(errorMessage(error)),
          })
        }
        onUnassign={() =>
          assignDriver.mutate(null, {
            onSuccess: () => {
              toast.showSuccess(t('driver.unassignSuccess'));
              setAssigningDriver(false);
            },
            onError: (error) => toast.showError(errorMessage(error)),
          })
        }
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
function BookingActionBar({
  booking,
  status,
  onEdit,
  onDecide,
}: {
  booking: BookingDetail;
  status: BookingStatus;
  /** Mở form sửa đơn — state của nó nằm ở màn cha vì tấm trượt mount theo điều kiện. */
  onEdit: () => void;
  /** Mở hộp xác nhận cho một quyết định khép đơn (huỷ / khách không đến). */
  onDecide: (decision: Decision) => void;
}) {
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
  const handovers = useHandoverContext(booking.id, !closed);
  const context = handovers.data;

  const canViewHandover = permissions.has(PERMISSION.HANDOVER_VIEW);
  const canManageHandover = permissions.has(PERMISSION.HANDOVER_MANAGE);
  const canUpdate = permissions.has(PERMISSION.BOOKING_UPDATE);
  const canRecordPayment = permissions.has(PERMISSION.PAYMENT_RECORD);

  const hasDebt = !isZeroMoney(booking.debtAmount);
  /** Đã lập biên bản chưa — lối "Ảnh bàn giao" chỉ có nghĩa khi thật sự đã có biên bản. */
  const hasHandover = Boolean(context?.pickup ?? context?.return);

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
  if (permissions.has(PERMISSION.CONTRACT_MANAGE)) {
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
  if (permissions.hasAny(PERMISSION.PAYMENT_RECORD, PERMISSION.FINANCE_VIEW)) {
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

  if (canRecordPayment) {
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
            onPress={() => navigateOnce(ROUTES.manage.handover(booking.id, cta.type))}
          />
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
