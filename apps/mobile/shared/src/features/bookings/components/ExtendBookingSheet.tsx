import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney, rentalProgress } from '@xeprime/domain';
import { BOOKING_EXTENSION_STATUS, LONG_TERM_PACKAGE_MONTHS } from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DataRow } from '@/components/ui/DataRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BankTransferDetails } from '@/features/payment-gateway/components/BankTransferDetails';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import {
  pendingExtensionOf,
  useBookingExtensionQuote,
  useBookingExtensions,
  useCancelBookingExtension,
  useCreateBookingExtension,
} from '../hooks/use-booking-extensions';
import type { BookingExtension, BookingListItem } from '../api';

/** Trường của đơn mà tấm gia hạn cần — chung cho thẻ danh sách và trang chi tiết (web `ExtendableBooking`). */
export type ExtendableBooking = Pick<
  BookingListItem,
  | 'id'
  | 'code'
  | 'vehicleName'
  | 'vehiclePlate'
  | 'pickupAt'
  | 'returnAt'
  | 'actualPickupAt'
  | 'totalAmount'
  | 'debtAmount'
>;

/**
 * GIA HẠN THUÊ XE — đơn dài hạn đang chạy (ADR 0077). Bản native của `ExtendBookingDialog` (web).
 *
 * Bước do DỮ LIỆU quyết: đơn đang có phụ lục chờ tiền ⇒ mở thẳng màn thanh toán của phụ lục đó.
 * Chỉ gói THÁNG (điều 2); khoản QR là phần giữ chỗ, phần còn lại khách trả thẳng chủ xe (điều 5);
 * không có nút "khách đã chuyển" — phụ lục tự lật khi SePay đối soát đủ, tấm tự đổi theo.
 *
 * Nơi gọi dựng CÓ ĐIỀU KIỆN nên không có state nào sót từ lần mở trước.
 */
export function ExtendBookingSheet({
  booking,
  onClose,
}: {
  booking: ExtendableBooking;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.extension');
  const extensions = useBookingExtensions(booking.id);
  /** Phụ lục vừa tạo trong lượt mở này — giữ màn thanh toán sau khi nó hiệu lực/đóng. */
  const [shownId, setShownId] = useState<string | null>(null);

  const pending = pendingExtensionOf(extensions.data);
  const shown =
    (shownId ? extensions.data?.find((e) => e.id === shownId) : undefined) ?? pending ?? null;

  return (
    <BottomSheet open onClose={onClose} title={shown ? t('payTitle') : t('dialogTitle')}>
      {extensions.isPending ? (
        <YStack gap={space.sm}>
          <Skeleton height={80} />
          <Skeleton height={120} />
        </YStack>
      ) : shown ? (
        <PaymentStep bookingId={booking.id} extension={shown} onClose={onClose} />
      ) : (
        <ChooseStep booking={booking} onCreated={setShownId} onClose={onClose} />
      )}
    </BottomSheet>
  );
}

function ChooseStep({
  booking,
  onCreated,
  onClose,
}: {
  booking: ExtendableBooking;
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.extension');
  const colors = useColors();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const [months, setMonths] = useState<number>(LONG_TERM_PACKAGE_MONTHS[0]);
  const quote = useBookingExtensionQuote(booking.id, months);
  const create = useCreateBookingExtension(booking.id);

  const progress = rentalProgress(booking.actualPickupAt ?? booking.pickupAt, booking.returnAt);
  const q = quote.data;
  // `keepPreviousData` giữ số cũ trong lúc tải mốc mới — chỉ cho gửi khi số thuộc đúng mốc đang chọn.
  const fresh = q !== undefined && q.months === months && !quote.isPlaceholderData;
  const canSubmit = fresh && q.available && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate(months, {
      onSuccess: (created) => onCreated(created.id),
      onError: (err) => toast.showError(errorMessage(err)),
    });
  }

  return (
    <YStack gap={space.md}>
      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {booking.vehicleName}
            {booking.vehiclePlate ? ` · ${booking.vehiclePlate}` : ''}
          </Text>
          <DataRow
            label={t('rentalPeriod')}
            value={fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
          />
          <DataRow
            label={t('remaining')}
            value={
              progress.overdueMinutes > 0
                ? t('overdueValue', { duration: fmt.minutesDuration(progress.overdueMinutes) })
                : t('remainingValue', {
                    duration: fmt.minutesDuration(progress.remainingMinutes),
                    percent: progress.percent,
                  })
            }
            tone={progress.overdueMinutes > 0 ? 'danger' : 'default'}
          />
          {q ? <DataRow label={t('unitPrice')} value={fmt.pricePerMonth(q.monthlyPrice)} /> : null}
          <DataRow
            label={t('currentTotal')}
            value={fmt.money(booking.totalAmount)}
            valueHint={
              isZeroMoney(booking.debtAmount)
                ? t('paidInFull')
                : t('outstanding', { amount: fmt.money(booking.debtAmount) })
            }
          />
        </YStack>
      </Card>

      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('chooseHeading')}
        </Text>
        <XStack flexWrap="wrap" gap={space.sm} accessibilityLabel={t('monthsGroupLabel')}>
          {LONG_TERM_PACKAGE_MONTHS.map((m) => (
            <Chip
              key={m}
              label={t('monthsChip', { months: m })}
              selected={m === months}
              onPress={() => setMonths(m)}
            />
          ))}
        </XStack>
        <DataRow label={t('fromLabel')} value={fmt.shortDateTime(booking.returnAt)} />
        <DataRow label={t('toLabel')} value={q ? fmt.shortDateTime(q.toAt) : '—'} strong />
        {quote.isError ? (
          <Callout tone="danger" title={t('quoteError')}>
            {errorMessage(quote.error)}
          </Callout>
        ) : !fresh ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('checking')}
          </Text>
        ) : q.available ? (
          <Callout tone="success">{t('available')}</Callout>
        ) : (
          <Callout tone="danger">{t('busy', { date: fmt.shortDateTime(q.busyFrom) })}</Callout>
        )}
      </YStack>

      {q ? (
        <Card lift="flat">
          <YStack gap={space.xs} opacity={fresh ? 1 : 0.6}>
            <DataRow label={t('durationLabel')} value={t('durationValue', { months: q.months })} />
            <DataRow
              label={t('feeLabel')}
              hint={`${fmt.pricePerMonth(q.monthlyPrice)}${
                q.durationDiscountPercent
                  ? ` · ${t('feeDiscount', { percent: q.durationDiscountPercent })}`
                  : ''
              }`}
              value={fmt.money(q.rentalAmount)}
              tone="price"
              strong
            />
            <DataRow label={t('onlineLine')} value={fmt.money(q.onlineAmount)} />
            <DataRow label={t('directLine')} value={fmt.money(q.payAtPickupAmount)} />
            {!isZeroMoney(q.taxAmount) ? (
              <DataRow label={t('taxLine')} value={`−${fmt.money(q.taxAmount)}`} tone="muted" />
            ) : null}
            <DataRow label={t('walletLine')} value={fmt.money(q.ownerPayableAmount)} tone="muted" />
            <Callout tone="success">{t('freeNote')}</Callout>
          </YStack>
        </Card>
      ) : null}

      <XStack gap={space.sm}>
        <YStack f={1}>
          <Button label={t('close')} variant="neutral" block onPress={onClose} />
        </YStack>
        <YStack f={1}>
          <Button
            label={t('submit')}
            icon="arrow-forward"
            block
            disabled={!canSubmit}
            loading={create.isPending}
            onPress={submit}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}

function PaymentStep({
  bookingId,
  extension,
  onClose,
}: {
  bookingId: string;
  extension: BookingExtension;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.extension');
  const colors = useColors();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const cancel = useCancelBookingExtension(bookingId);
  const [confirming, setConfirming] = useState(false);
  const awaiting = extension.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT;

  function doCancel() {
    cancel.mutate(extension.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.showSuccess(t('cancelled'));
        onClose();
      },
      onError: (err) => {
        setConfirming(false);
        toast.showError(errorMessage(err));
      },
    });
  }

  return (
    <YStack gap={space.md}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('paySubtitle')}
      </Text>

      {extension.status === BOOKING_EXTENSION_STATUS.ACTIVE ? (
        <Callout tone="success">
          {t('activated', { date: fmt.shortDateTime(extension.toAt) })}
        </Callout>
      ) : !awaiting ? (
        <Callout tone="info">{t('closedNotice')}</Callout>
      ) : (
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('payMethod')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('payHint')}
          </Text>
          <BankTransferDetails
            account={extension.paymentInfo}
            amount={extension.remainingAmount}
            code={extension.code}
          />
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              • {t('payWaiting')}
            </Text>
            {!isZeroMoney(extension.paidAmount) ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                •{' '}
                {t('payProgress', {
                  paid: fmt.money(extension.paidAmount),
                  total: fmt.money(extension.onlineAmount),
                })}
              </Text>
            ) : null}
            {!isZeroMoney(extension.payAtPickupAmount) ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                • {t('payDirect', { amount: fmt.money(extension.payAtPickupAmount) })}
              </Text>
            ) : null}
            {extension.expiresAt ? (
              <Text col={colors.warning} fos={fontSize.bodySm}>
                • {t('payDeadline', { time: fmt.shortDateTime(extension.expiresAt) })}
              </Text>
            ) : null}
          </YStack>
        </YStack>
      )}

      <XStack gap={space.sm}>
        {awaiting ? (
          <YStack f={1}>
            <Button
              label={t('cancelExtension')}
              variant="dangerOutline"
              block
              loading={cancel.isPending}
              onPress={() => setConfirming(true)}
            />
          </YStack>
        ) : null}
        <YStack f={1}>
          <Button label={t('done')} block onPress={onClose} />
        </YStack>
      </XStack>

      <AlertDialog
        open={confirming}
        title={t('cancelConfirmTitle')}
        message={t('cancelConfirmBody')}
        confirmLabel={t('cancelExtension')}
        destructive
        loading={cancel.isPending}
        onConfirm={doCancel}
        onCancel={() => setConfirming(false)}
      />
    </YStack>
  );
}
