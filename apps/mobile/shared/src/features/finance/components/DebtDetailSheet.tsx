import { Fragment } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LIST_SEPARATOR,
  isNegativeMoney,
  isZeroMoney,
  overdueDays,
  subtractMoney,
} from '@xeprime/domain';
import {
  BOOKING_STATUS_META,
  isBookingClosedWithoutTrip,
  PAYMENT_STATUS,
  PAYMENT_STATUS_META,
  PERMISSION,
  PLAN_FEATURE,
  type BookingStatus,
  type PaymentStatus,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ContactActions } from '@/components/ui/ContactActions';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { MiniRowsSkeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useBooking } from '@/features/bookings/hooks/use-bookings';
import {
  PaymentSideCard,
  SideCard,
  SideTitle,
  VehicleSideCard,
} from '@/features/bookings/components/BookingDetailSide';
import type { BookingDetail } from '@/features/bookings/api';
import { BookingCustomerIdentity } from '@/features/bookings/components/BookingCustomerIdentity';
import { useCustomerProfileAccess } from '@/features/booking-requests/hooks/use-customer-profile-access';
import { useStartBookingRequestConversation } from '@/features/booking-requests/hooks/use-booking-requests';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePaymentHistory } from '@/features/settlement/hooks/use-settlement';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { radius, typeScale } from '@/theme/tokens';

/** Figma "Filter Form" `24512:131958`: các khối cách 16. */
const BLOCK_GAP = 16;
/** Dải "Còn nợ" `24512:133425`: đệm 16, bo 12, hai cụm cách 8, trong cụm cách 4; thanh 8 bo 4. */
const BANNER_PAD = 16;
const BANNER_GAP = 8;
const BANNER_INNER_GAP = 4;
const TRACK_HEIGHT = 8;
const TRACK_RADIUS = 4;
/** Thẻ thông tin: dòng cách 8, cụm cách 12; ảnh khách 48. */
const ROW_GAP = 8;
const GROUP_GAP = 12;
/** Chân tấm: hai nút cách 12. */
const FOOTER_GAP = 12;
const FULL_PERCENT = 100;

function paidPercent(paid: string, total: string): number {
  const p = Number(paid);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(FULL_PERCENT, Math.floor((p / t) * FULL_PERCENT)));
}

/**
 * Chi tiết một khoản nợ — bản native của `DebtDetailDialog` (web, PR #276), dựng thành tấm trượt
 * theo Figma "Chi tiết đơn" `24512:131768` (người dùng chốt 26/11/2026).
 *
 * Đọc đúng chi tiết ĐƠN (`GET /bookings/:id`) như web: dải còn nợ (quá hạn · hạn trả · đã trả /
 * phải thu · nút Thu tiền), thẻ Thanh toán CHUNG với hồ sơ đơn, lịch sử thu tiền, cọc theo đơn /
 * cọc đã nhận, chi phí phát sinh, xe và khách. Chân tấm mở hồ sơ đơn đầy đủ.
 */
export function DebtDetailSheet({
  bookingId,
  onClose,
  onCollect,
  hidden = false,
  onLeave,
  preview,
}: {
  bookingId: string | null;
  /**
   * Dữ liệu ĐÃ CÓ ở thẻ danh sách - đầu tấm hiện ngay "Đơn #mã" + trạng thái + xe trong lúc chờ API
   * thay vì "Đơn #…" (người dùng 26/11/2026). Chỉ để hiển thị trước; dữ liệu thật vẫn đọc từ API.
   */
  preview?: { code: string; status: string; vehicleName: string; plateNumber: string | null } | null;
  onClose: () => void;
  /** Tạm ẩn (đang ở màn khác mở từ tấm này) - giữ nguyên đơn đang xem để quay về là thấy lại. */
  hidden?: boolean;
  /**
   * Rời tấm sang một màn khác (chi tiết đơn, hợp đồng, xe, hồ sơ khách, nhắn tin): nơi gọi chỉ TẠM
   * ẨN tấm, lui về thì tấm hiện lại đúng đơn đó (người dùng 26/11/2026). Vắng ⇒ đóng hẳn như cũ.
   */
  onLeave?: () => void;
  /** Mở tấm thu tiền đã có (FIN-05) — tấm này tự đóng trước để hai tấm không chồng nhau. */
  onCollect: (booking: { bookingId: string; debtAmount: string; code: string }) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.detail');
  const tApp = useTranslations('Finance.debts.partnerApp.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const createContract = useCreateContract();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const leave = onLeave ?? onClose;

  const query = useBooking(bookingId ?? '');
  const booking = bookingId ? query.data : undefined;
  // Web `can.collect`: đơn huỷ / khách không đến không nhận tiền mới (`BOOKING_MONEY_CLOSED`).
  const moneyClosed = booking
    ? isBookingClosedWithoutTrip(booking.status as BookingStatus)
    : false;
  const canCollect =
    permissions.has(PERMISSION.PAYMENT_RECORD) && finance.isVisible && !moneyClosed;
  const customerProfileAccess = useCustomerProfileAccess();
  const startConversation = useStartBookingRequestConversation();
  const tRequestActions = useTranslations('BookingRequests.actions');
  const canHistory = finance.isVisible;
  const history = usePaymentHistory(bookingId ?? '', Boolean(bookingId) && canHistory);

  const status = (booking?.status ?? preview?.status) as BookingStatus | undefined;
  // Figma "Header cố định": "Đơn #mã" + viên trạng thái, dòng phụ "xe · biển số".
  const title = tApp('title', { code: booking?.code ?? preview?.code ?? '…' });
  const statusPill = status ? (
    <Pill
      size="lg"
      label={domainLabel('bookingStatus', status, metaLabel(BOOKING_STATUS_META, status))}
      tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, status))}
    />
  ) : null;
  const subtitle = booking
    ? [booking.vehicleName, booking.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR)
    : preview
      ? [preview.vehicleName, preview.plateNumber].filter(Boolean).join(LIST_SEPARATOR)
      : '';

  // Hợp đồng thuộc bộ cơ bản (ADR 0027 sửa 20/11/2026) - chỉ xét quyền.
  const canContract = permissions.has(PERMISSION.CONTRACT_MANAGE);
  /* Chưa có dữ liệu chuẩn bị bàn giao thì coi như đã biết — nhãn "Hợp đồng", như web. */
  const contractKnown = booking?.handoverPrep ? booking.handoverPrep.contractId != null : true;

  /*
    Figma "Footer cố định": MỘT hàng - "Hợp đồng" viền co vừa chữ · "Chi tiết đơn thuê" vàng lấy
    phần còn lại (luật hàng hai nút của `Button`).
  */
  const footer = booking ? (
    <XStack gap={FOOTER_GAP}>
      {canContract ? (
        <YStack flexShrink={0}>
          <Button
            label={contractKnown ? t('contract') : t('createContract')}
            variant="neutral"
            block={false}
            loading={createContract.isPending}
            onPress={() =>
              // Idempotent ở server: đã có hợp đồng thì trả đúng bản cũ — cùng đường với hồ sơ đơn.
              createContract.mutate(booking.id, {
                onSuccess: (contract) => {
                  leave();
                  navigateOnce(ROUTES.manage.contract(contract.id));
                },
                onError: (error) => toast.showError(errorMessage(error)),
              })
            }
          />
        </YStack>
      ) : null}
      <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
        <Button
          label={t('openBooking')}
          variant="gradient"
          onPress={() => {
            leave();
            navigateOnce(ROUTES.manage.bookingDetail(booking.id));
          }}
        />
      </YStack>
    </XStack>
  ) : undefined;

  return (
    <BottomSheet
      open={bookingId !== null && !hidden}
      onClose={onClose}
      title={title}
      {...(statusPill ? { titleAdornment: statusPill } : {})}
      {...(subtitle ? { subtitle } : {})}
      chrome="v2"
      headerDivider
      footer={footer}
    >
      {query.isPending ? (
        <SkeletonText lines={8} />
      ) : query.isError || !booking ? (
        <ScreenError
          error={query.error}
          title={t('errorTitle')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <YStack gap={BLOCK_GAP}>
          <DebtBanner
            debtAmount={booking.debtAmount}
            collectedAmount={booking.collectedAmount}
            amountDue={booking.amountDue}
            returnAt={booking.returnAt}
            {...(canCollect && !isZeroMoney(booking.debtAmount)
              ? {
                  onCollect: () => {
                    // Tấm thu tiền mở NGAY trên màn này - đóng hẳn để hai tấm không chồng nhau.
                    onClose();
                    onCollect({ bookingId: booking.id, debtAmount: booking.debtAmount, code: booking.code });
                  },
                }
              : {})}
          />

          {/* Thẻ "Thanh toán" CHUNG với hồ sơ đơn - giữ nguyên số liệu/nhãn (người dùng chốt 26/11/2026). */}
          <PaymentSideCard booking={booking} />

          {/* Figma "Lịch sử thu tiền" `24512:133536`: các khoản thu · vạch · cọc theo đơn / đã nhận · phát sinh. */}
          <SideCard>
            <SideTitle>{t('history')}</SideTitle>
            {canHistory ? (
              history.isPending ? (
                <MiniRowsSkeleton rows={2} />
              ) : history.isError ? (
                <Text col={colors.danger} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {t('historyError')}
                </Text>
              ) : (history.data ?? []).length === 0 ? (
                <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {t('historyEmpty')}
                </Text>
              ) : (
                <YStack gap={GROUP_GAP}>
                  {(history.data ?? []).map((p, index) => {
                    const ps = p.status as PaymentStatus;
                    const refunded = p.status === PAYMENT_STATUS.REFUNDED;
                    return (
                      <Fragment key={p.id}>
                        {index > 0 ? <YStack h={1} bg={colors.border} /> : null}
                        <XStack ai="center" gap={ROW_GAP}>
                          <YStack f={1} minWidth={0} gap={2}>
                            {/* Figma: số tiền ĐEN; khoản đã hoàn gạch ngang, mờ. */}
                            <Text
                              col={refunded ? colors.placeholder : colors.text}
                              fos={typeScale.body.fontSize}
                              lh={typeScale.body.lineHeight}
                              fontFamily={FONT_FAMILY.semibold}
                              textDecorationLine={refunded ? 'line-through' : 'none'}
                            >
                              {`+${fmt.money(p.amount)}`}
                            </Text>
                            {/* Giữ phương thức (tiền mặt/chuyển khoản) dù Figma không vẽ - người dùng chốt. */}
                            <Text
                              col={colors.placeholder}
                              fos={typeScale.label.fontSize}
                              lh={typeScale.label.lineHeight}
                              numberOfLines={2}
                            >
                              {[
                                fmt.dateTime(p.paidAt ?? p.createdAt),
                                domainLabel('paymentKind', p.kind),
                                domainLabel('paymentMethod', p.method),
                              ].join(LIST_SEPARATOR)}
                            </Text>
                          </YStack>
                          <Pill
                            label={domainLabel('paymentStatus', ps)}
                            tone={pillToneOfStatusColor(metaColor(PAYMENT_STATUS_META, ps))}
                          />
                        </XStack>
                      </Fragment>
                    );
                  })}
                </YStack>
              )
            ) : null}

            <YStack h={1} bg={colors.border} />
            <YStack gap={ROW_GAP}>
              <InfoRow
                label={t('depositExpected')}
                value={isZeroMoney(booking.depositAmount) ? t('none') : fmt.money(booking.depositAmount)}
              />
              {booking.handoverPrep && !isZeroMoney(booking.handoverPrep.depositRequired) ? (
                <InfoRow
                  label={t('depositReceived')}
                  value={
                    isZeroMoney(booking.handoverPrep.depositReceived)
                      ? t('depositReceivedNo')
                      : depositSettled(
                            booking.handoverPrep.depositRequired,
                            booking.handoverPrep.depositReceived,
                          )
                        ? t('depositReceivedYes')
                        : fmt.money(booking.handoverPrep.depositReceived)
                  }
                />
              ) : null}
              <InfoRow
                label={t('surcharge')}
                value={isZeroMoney(booking.surchargeTotal) ? t('none') : fmt.money(booking.surchargeTotal)}
              />
            </YStack>
          </SideCard>

          {/*
            Xe - thẻ CHUNG với Chi tiết đơn (giữ giờ nhận/trả + thời lượng), thêm tiêu đề "Xe & Giao
            nhận" của Figma (người dùng chốt 26/11/2026). Liên kết xe theo `vehicles.view`.
          */}
          <VehicleSideCard
            booking={booking}
            title={tApp('vehicle')}
            onOpenVehicle={
              permissions.has(PERMISSION.VEHICLE_VIEW)
                ? () => {
                    leave();
                    navigateOnce(ROUTES.manage.vehicleDetail(booking.vehicleId));
                  }
                : undefined
            }
          />

          {/*
            Khách - Figma "Customer Details" `24512:133664`: nhãn · ảnh 48 · tên (hồ sơ khách theo
            quyền + tuyến) + "Khách quen" · SĐT · Nhắn tin / Gọi / Zalo có chữ, cùng cổng như trước.
          */}
          <DebtCustomerCard
            booking={booking}
            onViewProfile={
              booking.tenantCustomerId && customerProfileAccess
                ? () => {
                    leave();
                    navigateOnce(ROUTES.manage.customerDetail(booking.tenantCustomerId as string));
                  }
                : undefined
            }
            onMessage={
              permissions.has(PERMISSION.BOOKING_REQUEST_VIEW) && booking.bookingRequestId
                ? () => {
                    const requestId = booking.bookingRequestId;
                    if (!requestId) return;
                    if (!booking.canMessageOnPlatform) {
                      toast.showInfo(tRequestActions('messageUnavailable'));
                      return;
                    }
                    startConversation.mutate(requestId, {
                      onSuccess: (conversation) => {
                        leave();
                        navigateOnce(ROUTES.manage.chatThread(conversation.id, requestId));
                      },
                      onError: (error) => toast.showError(errorMessage(error)),
                    });
                  }
                : undefined
            }
            messageLoading={startConversation.isPending}
          />
        </YStack>
      )}
    </BottomSheet>
  );
}

/** Cọc đã nhận đủ — phần còn thiếu ≤ 0 (so trên chuỗi tiền, ADR 0007). */
function depositSettled(required: string, received: string): boolean {
  const outstanding = subtractMoney(required, received);
  return isZeroMoney(outstanding) || isNegativeMoney(outstanding);
}

/** Một dòng "nhãn ······ giá trị" (Figma: 14/20, nhãn `text/gray/low`, giá trị đậm vừa `text/gray/high`). */
function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" jc="space-between" gap={GROUP_GAP}>
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} flexShrink={0}>
        {label}
      </Text>
      <Text
        f={1}
        minWidth={0}
        ta="right"
        col={colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fontFamily={FONT_FAMILY.medium}
      >
        {value}
      </Text>
    </XStack>
  );
}

function DebtCustomerCard({
  booking,
  onViewProfile,
  onMessage,
  messageLoading,
}: {
  booking: BookingDetail;
  onViewProfile?: (() => void) | undefined;
  onMessage?: (() => void) | undefined;
  messageLoading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.table.columns');
  const tContact = useTranslations('BookingRequests.actions');
  return (
    <SideCard>
      <YStack gap={ROW_GAP}>
        <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {t('customer')}
        </Text>
        <BookingCustomerIdentity booking={booking} onViewProfile={onViewProfile} />
      </YStack>
      {/* "Nhắn tin" chỉ khi nơi gọi truyền `onMessage` (ADR 0073); chưa nhắn được thì nút MỜ nhưng chạm được để báo lý do. */}
      <ContactActions
        labeled
        phone={booking.customerPhone}
        labels={{ message: tContact('message'), call: tContact('call'), zalo: tContact('zalo') }}
        onMessage={onMessage}
        messageUnavailable={!booking.canMessageOnPlatform}
        messageLoading={messageLoading}
        disabled={messageLoading}
      />
    </SideCard>
  );
}

/**
 * Dải "Còn nợ" - Figma "Payment Summary" `24512:133425`: nền `bg/destructive-low`, viền `error-300`;
 * nhãn VIẾT HOA 14/20 · số 24/32 đỏ, nút "Thu tiền" góc phải; "Quá hạn N ngày" đậm đỏ nối
 * " · hạn trả …"; thanh 8 (đã trả / phải thu) và câu "Đã trả x / y".
 */
function DebtBanner({
  debtAmount,
  collectedAmount,
  amountDue,
  returnAt,
  onCollect,
}: {
  debtAmount: string;
  collectedAmount: string;
  amountDue: string;
  returnAt: string;
  onCollect?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.detail');
  const fmt = useAppFormat();
  const late = overdueDays(returnAt);
  const percent = paidPercent(collectedAmount, amountDue);
  const due = t('dueAt', { date: fmt.dateTime(returnAt) });

  return (
    <YStack
      p={BANNER_PAD}
      gap={BANNER_GAP}
      br={radius.control}
      bw={1}
      bc={colors.dangerBorder}
      bg={colors.dangerSurface}
    >
      <YStack gap={BANNER_INNER_GAP}>
        <XStack ai="flex-start" jc="space-between" gap={ROW_GAP}>
          <YStack f={1} minWidth={0} gap={BANNER_INNER_GAP}>
            <Text
              col={colors.placeholder}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.medium}
              textTransform="uppercase"
            >
              {t('debtLabel')}
            </Text>
            <Text
              col={colors.danger}
              fos={typeScale.display.fontSize}
              lh={typeScale.display.lineHeight}
              fontFamily={FONT_FAMILY.semibold}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {fmt.money(debtAmount)}
            </Text>
          </YStack>
          {onCollect ? (
            <YStack flexShrink={0}>
              <Button
                label={t('collect')}
                lineIcon="dollar-circle"
                variant="gradient"
                block={false}
                onPress={onCollect}
              />
            </YStack>
          ) : null}
        </XStack>
        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {late > 0 ? (
            <Text
              col={colors.danger}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.semibold}
            >
              {t('overdue', { count: late })}
            </Text>
          ) : null}
          {late > 0 ? `${LIST_SEPARATOR}${due}` : due}
        </Text>
      </YStack>
      <YStack gap={BANNER_INNER_GAP}>
        <YStack
          h={TRACK_HEIGHT}
          br={TRACK_RADIUS}
          bg={colors.borderInput}
          ov="hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: FULL_PERCENT, now: percent }}
        >
          <YStack h={TRACK_HEIGHT} br={TRACK_RADIUS} bg={colors.successAccent} width={`${percent}%`} />
        </YStack>
        <Text
          col={colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fontFamily={FONT_FAMILY.medium}
        >
          {t('paidOf', { paid: fmt.money(collectedAmount), total: fmt.money(amountDue) })}
        </Text>
      </YStack>
    </YStack>
  );
}
