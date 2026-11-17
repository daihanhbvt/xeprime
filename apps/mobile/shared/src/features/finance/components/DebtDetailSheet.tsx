import { Fragment } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, isNegativeMoney, isZeroMoney, overdueDays, subtractMoney } from '@xeprime/domain';
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
import { SectionHeader } from '@/components/ui/CardTitle';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { MiniRowsSkeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useBooking } from '@/features/bookings/hooks/use-bookings';
import {
  CustomerSideCard,
  PaymentSideCard,
  VehicleSideCard,
} from '@/features/bookings/components/BookingDetailSide';
import { RentalContactButtons } from '@/features/bookings/components/rental-card/RentalCard';
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
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

const TRACK_HEIGHT = 6;

function paidPercent(paid: string, total: string): number {
  const p = Number(paid);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((p / t) * 100)));
}

/**
 * Chi tiết một khoản nợ — bản native của `DebtDetailDialog` (web, PR #276), dựng thành tấm trượt.
 *
 * Đọc đúng chi tiết ĐƠN (`GET /bookings/:id`) như web: dải còn nợ (quá hạn · hạn trả · đã trả /
 * phải thu · nút Thu tiền), lịch sử thu tiền, cọc theo đơn / cọc đã nhận, chi phí phát sinh, xe và
 * khách. Chân tấm mở hồ sơ đơn đầy đủ — mọi thao tác khác (hợp đồng, bàn giao) nằm ở đó.
 */
export function DebtDetailSheet({
  bookingId,
  onClose,
  onCollect,
}: {
  bookingId: string | null;
  onClose: () => void;
  /** Mở tấm thu tiền đã có (FIN-05) — tấm này tự đóng trước để hai tấm không chồng nhau. */
  onCollect: (booking: { bookingId: string; debtAmount: string }) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const contracts = useFeature(PLAN_FEATURE.CONTRACTS);
  const createContract = useCreateContract();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();

  const query = useBooking(bookingId ?? '');
  const booking = bookingId ? query.data : undefined;
  // Web `can.collect`: đơn huỷ / khách không đến không nhận tiền mới (`BOOKING_MONEY_CLOSED`).
  const moneyClosed = booking
    ? isBookingClosedWithoutTrip(booking.status as BookingStatus)
    : false;
  const canCollect =
    permissions.has(PERMISSION.PAYMENT_RECORD) && finance.isVisible && !moneyClosed;
  const customerProfileAccess = useCustomerProfileAccess();
  const canDocuments = permissions.has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE);
  const startConversation = useStartBookingRequestConversation();
  const tRequestActions = useTranslations('BookingRequests.actions');
  const canHistory = finance.isVisible;
  const history = usePaymentHistory(bookingId ?? '', Boolean(bookingId) && canHistory);

  const status = booking?.status as BookingStatus | undefined;
  const title = t('title', { code: booking?.code ?? '…' });

  const canContract = permissions.has(PERMISSION.CONTRACT_MANAGE) && contracts.isVisible;
  /* Chưa có dữ liệu chuẩn bị bàn giao thì coi như đã biết — nhãn "Hợp đồng", như web. */
  const contractKnown = booking?.handoverPrep ? booking.handoverPrep.contractId != null : true;

  const footer = booking ? (
    <YStack gap={space.sm}>
      {canContract ? (
        <Button
          label={contractKnown ? t('contract') : t('createContract')}
          icon="document-attach-outline"
          variant="secondary"
          loading={createContract.isPending}
          onPress={() =>
            // Idempotent ở server: đã có hợp đồng thì trả đúng bản cũ — cùng đường với hồ sơ đơn.
            createContract.mutate(booking.id, {
              onSuccess: (contract) => {
                onClose();
                navigateOnce(ROUTES.manage.contract(contract.id));
              },
              onError: (error) => toast.showError(errorMessage(error)),
            })
          }
        />
      ) : null}
      <Button
        label={t('openBooking')}
        icon="open-outline"
        onPress={() => {
          onClose();
          navigateOnce(ROUTES.manage.bookingDetail(booking.id));
        }}
      />
    </YStack>
  ) : undefined;

  return (
    <BottomSheet open={bookingId !== null} onClose={onClose} title={title} footer={footer}>
      {query.isPending ? (
        <SkeletonText lines={8} />
      ) : query.isError || !booking ? (
        <ScreenError
          error={query.error}
          title={t('errorTitle')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <YStack gap={space.md}>
          {status ? (
            <XStack>
              <StatusBadge
                label={domainLabel('bookingStatus', status, metaLabel(BOOKING_STATUS_META, status))}
                color={metaColor(BOOKING_STATUS_META, status)}
                size="sm"
              />
            </XStack>
          ) : null}

          <DebtBanner
            debtAmount={booking.debtAmount}
            collectedAmount={booking.collectedAmount}
            amountDue={booking.amountDue}
            returnAt={booking.returnAt}
            {...(canCollect && !isZeroMoney(booking.debtAmount)
              ? {
                  onCollect: () => {
                    onClose();
                    onCollect({ bookingId: booking.id, debtAmount: booking.debtAmount });
                  },
                }
              : {})}
          />

          {/* Web `DebtDetailDialog`: khối "Thanh toán" (`PaymentSideCard`) đứng trước lịch sử thu. */}
          <PaymentSideCard booking={booking} />

          {/* Lịch sử thu tiền + cọc + phát sinh. */}
          <Card lift="flat">
            <YStack gap={space.sm}>
              <SectionHeader icon="receipt-outline">{t('history')}</SectionHeader>
              {canHistory ? (
                history.isPending ? (
                  <MiniRowsSkeleton rows={2} />
                ) : history.isError ? (
                  <Text col={colors.danger} fos={fontSize.bodySm}>
                    {t('historyError')}
                  </Text>
                ) : (history.data ?? []).length === 0 ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('historyEmpty')}
                  </Text>
                ) : (
                  <YStack>
                    {(history.data ?? []).map((p, index) => {
                      const ps = p.status as PaymentStatus;
                      return (
                        <Fragment key={p.id}>
                          {index > 0 ? <Divider /> : null}
                          <XStack ai="center" gap={space.sm} py={space.xs}>
                            <YStack f={1} minWidth={0} gap={2}>
                              <Text
                                col={
                                  p.status === PAYMENT_STATUS.REFUNDED
                                    ? colors.textMuted
                                    : colors.success
                                }
                                fos={fontSize.bodySm}
                                fow={fontWeight.semibold}
                                textDecorationLine={
                                  p.status === PAYMENT_STATUS.REFUNDED ? 'line-through' : 'none'
                                }
                              >
                                {`+${fmt.money(p.amount)}`}
                              </Text>
                              <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
                                {[
                                  fmt.dateTime(p.paidAt ?? p.createdAt),
                                  domainLabel('paymentKind', p.kind),
                                  domainLabel('paymentMethod', p.method),
                                ].join(LIST_SEPARATOR)}
                              </Text>
                            </YStack>
                            <StatusBadge
                              label={domainLabel('paymentStatus', ps)}
                              color={metaColor(PAYMENT_STATUS_META, ps)}
                              size="sm"
                            />
                          </XStack>
                        </Fragment>
                      );
                    })}
                  </YStack>
                )
              ) : null}

              <Divider />
              <DataRow
                label={t('depositExpected')}
                value={
                  isZeroMoney(booking.depositAmount) ? t('none') : fmt.money(booking.depositAmount)
                }
              />
              {booking.handoverPrep && !isZeroMoney(booking.handoverPrep.depositRequired) ? (
                <DataRow
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
              <DataRow
                label={t('surcharge')}
                value={
                  isZeroMoney(booking.surchargeTotal) ? t('none') : fmt.money(booking.surchargeTotal)
                }
              />
            </YStack>
          </Card>

          {/*
            Xe + khách - web `VehicleSideCard` · `CustomerSideCard` · `ContactButtons`: liên kết xe
            (`vehicles.view`), hồ sơ khách (sổ khách theo quyền + tuyến), giấy tờ, gọi/nhắn/Zalo.
          */}
          <VehicleSideCard
            booking={booking}
            onOpenVehicle={
              permissions.has(PERMISSION.VEHICLE_VIEW)
                ? () => {
                    onClose();
                    navigateOnce(ROUTES.manage.vehicleDetail(booking.vehicleId));
                  }
                : undefined
            }
          />
          <CustomerSideCard
            booking={booking}
            onViewProfile={
              booking.tenantCustomerId && customerProfileAccess
                ? () => {
                    onClose();
                    navigateOnce(ROUTES.manage.customerDetail(booking.tenantCustomerId as string));
                  }
                : undefined
            }
            onDocuments={
              booking.tenantCustomerId && canDocuments
                ? () => {
                    onClose();
                    navigateOnce(ROUTES.manage.customerDetail(booking.tenantCustomerId as string));
                  }
                : undefined
            }
          />
          <RentalContactButtons
            name={booking.customerName}
            phone={booking.customerPhone}
            {...(permissions.has(PERMISSION.BOOKING_REQUEST_VIEW) && booking.bookingRequestId
              ? {
                  onMessage: () => {
                    const requestId = booking.bookingRequestId;
                    if (!requestId) return;
                    if (!booking.canMessageOnPlatform) {
                      toast.showInfo(tRequestActions('messageUnavailable'));
                      return;
                    }
                    startConversation.mutate(requestId, {
                      onSuccess: (conversation) => {
                        onClose();
                        navigateOnce(ROUTES.manage.chatThread(conversation.id, requestId));
                      },
                      onError: (error) => toast.showError(errorMessage(error)),
                    });
                  },
                }
              : {})}
            messageUnavailable={!booking.canMessageOnPlatform}
            messageLoading={startConversation.isPending}
            disabled={startConversation.isPending}
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

  return (
    <Card tone="muted" lift="flat">
      <YStack gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
          {t('debtLabel')}
        </Text>
        <Text col={colors.danger} fos={fontSize.h3} fow={fontWeight.bold}>
          {fmt.money(debtAmount)}
        </Text>
        <Text col={late > 0 ? colors.danger : colors.textMuted} fos={fontSize.label}>
          {late > 0 ? `${t('overdue', { count: late })}${LIST_SEPARATOR}` : ''}
          {t('dueAt', { date: fmt.dateTime(returnAt) })}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('paidOf', { paid: fmt.money(collectedAmount), total: fmt.money(amountDue) })}
        </Text>
        <YStack
          h={TRACK_HEIGHT}
          br={radius.pill}
          bg={colors.surface}
          ov="hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <YStack h={TRACK_HEIGHT} br={radius.pill} bg={colors.success} width={`${percent}%`} />
        </YStack>
        {onCollect ? <Button label={t('collect')} icon="cash-outline" onPress={onCollect} /> : null}
      </YStack>
    </Card>
  );
}
