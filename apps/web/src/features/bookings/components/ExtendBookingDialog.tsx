'use client';

import { ArrowRightOutlined, CarOutlined, CheckCircleFilled } from '@ant-design/icons';
import { Alert, App, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { rentalProgress } from '@xeprime/domain';
import { BOOKING_EXTENSION_STATUS, LONG_TERM_PACKAGE_MONTHS } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { BankTransferDetails } from '@/features/payment-gateway/components/BankTransferDetails';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import {
  pendingExtensionOf,
  useBookingExtensionQuote,
  useBookingExtensions,
  useCancelBookingExtension,
  useCreateBookingExtension,
} from '../hooks/use-booking-extensions';
import type { BookingExtension, ExtendableBooking } from '../types';
import styles from './ExtendBookingDialog.module.css';

/**
 * GIA HẠN THUÊ XE — đơn dài hạn đang chạy (ADR 0077). Figma Partner-XePrime "Gia hạn thuê xe"
 * (`23807:68543`) rồi "Thanh toán" (`23807:70054`).
 *
 * Hai bước trong MỘT hộp thoại, bước do DỮ LIỆU quyết chứ không do state cục bộ: đơn đang có phụ
 * lục chờ tiền ⇒ mở thẳng màn thanh toán của phụ lục đó (mở lại từ thẻ hay từ trang chi tiết đều
 * ra cùng một mã). Lệch có chủ đích so với design, đã ghi ở sổ cái §3.2 dòng 12:
 *  - chỉ gói THÁNG (1/2/3/6/9/12) — không +7/+15 ngày (ADR 0077 điều 2);
 *  - khoản QR là phần GIỮ CHỖ, phần còn lại khách trả thẳng chủ xe (điều 5) — không thu hộ cả tiền;
 *  - không có "Ví điện tử" (cổng ví chưa mở — ADR 0058) và không có nút "khách đã chuyển": phụ lục
 *    tự lật khi SePay đối soát đủ, màn này tự đổi theo.
 *
 * Nơi gọi dựng CÓ ĐIỀU KIỆN (mỗi lần mở một instance mới) nên không có state nào sót từ đơn trước.
 */
export function ExtendBookingDialog({
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
  const paying = shown !== null;

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title={paying ? t('payTitle') : t('dialogTitle')}
      size="md"
      footer={null}
    >
      {extensions.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : paying ? (
        <PaymentStep bookingId={booking.id} extension={shown} onClose={onClose} />
      ) : (
        <ChooseStep booking={booking} onCreated={setShownId} onClose={onClose} />
      )}
    </ResponsiveDialog>
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
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const [months, setMonths] = useState<number>(LONG_TERM_PACKAGE_MONTHS[0]);
  const quote = useBookingExtensionQuote(booking.id, months);
  const create = useCreateBookingExtension(booking.id);

  const progress = rentalProgress(booking.actualPickupAt ?? booking.pickupAt, booking.returnAt);
  const q = quote.data;
  // Số đang hiện thuộc mốc vừa chọn chưa — `keepPreviousData` giữ số cũ trong lúc tải mốc mới.
  const fresh = q !== undefined && q.months === months && !quote.isPlaceholderData;
  const canSubmit = fresh && q.available && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate(months, {
      onSuccess: (created) => onCreated(created.id),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={styles.stack}>
      <section className={styles.summary}>
        <div className={styles.vehicle}>
          <span className={styles.thumb}>
            {booking.vehicleImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={booking.vehicleImageUrl} alt="" className={styles.thumbImage} />
            ) : (
              <CarOutlined aria-hidden="true" />
            )}
          </span>
          <div className={styles.vehicleText}>
            <span className={styles.vehicleName}>{booking.vehicleName}</span>
            {booking.vehiclePlate ? (
              <span className={styles.plate}>{booking.vehiclePlate}</span>
            ) : null}
          </div>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>{t('rentalPeriod')}</dt>
            <dd>
              {fmt.shortDateTime(booking.pickupAt)} → {fmt.shortDateTime(booking.returnAt)}
            </dd>
          </div>
          <div>
            <dt>{t('remaining')}</dt>
            <dd>
              {progress.overdueMinutes > 0
                ? t('overdueValue', { duration: fmt.roughDuration(progress.overdueMinutes) })
                : t('remainingValue', {
                    duration: fmt.roughDuration(progress.remainingMinutes),
                    percent: progress.percent,
                  })}
            </dd>
          </div>
          {q ? (
            <div>
              <dt>{t('unitPrice')}</dt>
              <dd>{fmt.pricePerMonth(q.monthlyPrice)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('currentTotal')}</dt>
            <dd className={styles.totalCell}>
              <span>{fmt.money(booking.totalAmount)}</span>
              {isZeroMoney(booking.debtAmount) ? (
                <span className={cx(styles.pill, styles.pillSuccess)}>{t('paidInFull')}</span>
              ) : (
                <span className={cx(styles.pill, styles.pillWarning)}>
                  {t('outstanding', { amount: fmt.money(booking.debtAmount) })}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.choose}>
        <h3 className={styles.heading}>{t('chooseHeading')}</h3>
        <div className={styles.chips} role="radiogroup" aria-label={t('monthsGroupLabel')}>
          {LONG_TERM_PACKAGE_MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === months}
              className={cx(styles.chip, m === months && styles.chipActive)}
              onClick={() => setMonths(m)}
            >
              {t('monthsChip', { months: m })}
            </button>
          ))}
        </div>
        <div className={styles.period}>
          <div className={styles.periodCell}>
            <span className={styles.periodLabel}>{t('fromLabel')}</span>
            <span className={styles.periodValue}>{fmt.shortDateTime(booking.returnAt)}</span>
          </div>
          <span className={styles.periodDash} aria-hidden="true">
            –
          </span>
          <div className={styles.periodCell}>
            <span className={styles.periodLabel}>{t('toLabel')}</span>
            <span className={cx(styles.periodValue, styles.periodNew)}>
              {q ? fmt.shortDateTime(q.toAt) : '—'}
            </span>
          </div>
        </div>
        {quote.isError ? (
          <Alert
            type="error"
            showIcon
            message={t('quoteError')}
            description={errorMessage(quote.error)}
          />
        ) : !fresh ? (
          <p className={styles.checking}>{t('checking')}</p>
        ) : q.available ? (
          <p className={cx(styles.availability, styles.availabilityOk)}>
            <CheckCircleFilled aria-hidden="true" />
            {t('available')}
          </p>
        ) : (
          <p className={cx(styles.availability, styles.availabilityBusy)} role="alert">
            {t('busy', { date: fmt.shortDateTime(q.busyFrom) })}
          </p>
        )}
      </section>

      {q ? (
        <section className={styles.fee} aria-busy={!fresh}>
          <div className={styles.feeRow}>
            <span>{t('durationLabel')}</span>
            <b>{t('durationValue', { months: q.months })}</b>
          </div>
          <div className={styles.feeRow}>
            <span className={styles.feeLabel}>
              {t('feeLabel')}
              <small>
                {fmt.pricePerMonth(q.monthlyPrice)}
                {q.durationDiscountPercent
                  ? ` · ${t('feeDiscount', { percent: q.durationDiscountPercent })}`
                  : ''}
              </small>
            </span>
            <b className={styles.feeAmount}>{fmt.money(q.rentalAmount)}</b>
          </div>
          <div className={styles.feeDivider} />
          <div className={styles.feeRow}>
            <span>{t('onlineLine')}</span>
            <span>{fmt.money(q.onlineAmount)}</span>
          </div>
          <div className={styles.feeRow}>
            <span>{t('directLine')}</span>
            <span>{fmt.money(q.payAtPickupAmount)}</span>
          </div>
          {!isZeroMoney(q.taxAmount) ? (
            <div className={cx(styles.feeRow, styles.feeMuted)}>
              <span>{t('taxLine')}</span>
              <span>−{fmt.money(q.taxAmount)}</span>
            </div>
          ) : null}
          <div className={cx(styles.feeRow, styles.feeMuted)}>
            <span>{t('walletLine')}</span>
            <span>{fmt.money(q.ownerPayableAmount)}</span>
          </div>
          <p className={styles.freeNote}>
            <CheckCircleFilled aria-hidden="true" />
            {t('freeNote')}
          </p>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <Button onClick={onClose}>{t('close')}</Button>
        <Button
          type="primary"
          disabled={!canSubmit}
          loading={create.isPending}
          onClick={submit}
          icon={<ArrowRightOutlined />}
          iconPosition="end"
        >
          {t('submit')}
        </Button>
      </footer>
    </div>
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
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message, modal } = App.useApp();
  const cancel = useCancelBookingExtension(bookingId);
  const awaiting = extension.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT;

  function confirmCancel() {
    modal.confirm({
      title: t('cancelConfirmTitle'),
      content: t('cancelConfirmBody'),
      okText: t('cancelExtension'),
      okButtonProps: { danger: true },
      onOk: () =>
        cancel.mutateAsync(extension.id).then(
          () => {
            message.success(t('cancelled'));
            onClose();
          },
          (err: unknown) => {
            message.error(errorMessage(err));
          },
        ),
    });
  }

  return (
    <div className={styles.stack}>
      <p className={styles.subtitle}>{t('paySubtitle')}</p>

      {extension.status === BOOKING_EXTENSION_STATUS.ACTIVE ? (
        <Alert
          type="success"
          showIcon
          message={t('activated', { date: fmt.shortDateTime(extension.toAt) })}
        />
      ) : !awaiting ? (
        <Alert type="info" showIcon message={t('closedNotice')} />
      ) : (
        <section className={styles.method}>
          <h3 className={styles.methodTitle}>{t('payMethod')}</h3>
          <p className={styles.methodHint}>{t('payHint')}</p>
          <BankTransferDetails
            account={extension.paymentInfo}
            amount={extension.remainingAmount}
            code={extension.code}
          />
          <ul className={styles.payNotes}>
            <li>{t('payWaiting')}</li>
            {!isZeroMoney(extension.paidAmount) ? (
              <li>
                {t('payProgress', {
                  paid: fmt.money(extension.paidAmount),
                  total: fmt.money(extension.onlineAmount),
                })}
              </li>
            ) : null}
            {!isZeroMoney(extension.payAtPickupAmount) ? (
              <li>{t('payDirect', { amount: fmt.money(extension.payAtPickupAmount) })}</li>
            ) : null}
            {extension.expiresAt ? (
              <li>{t('payDeadline', { time: fmt.shortDateTime(extension.expiresAt) })}</li>
            ) : null}
          </ul>
        </section>
      )}

      <footer className={styles.footer}>
        {awaiting ? (
          <Button
            danger
            className={styles.footerStart}
            loading={cancel.isPending}
            onClick={confirmCancel}
          >
            {t('cancelExtension')}
          </Button>
        ) : null}
        <Button type="primary" onClick={onClose}>
          {t('done')}
        </Button>
      </footer>
    </div>
  );
}
