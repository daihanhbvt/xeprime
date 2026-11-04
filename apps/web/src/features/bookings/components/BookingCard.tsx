'use client';

import { CarOutlined, SyncOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  isLateReturn,
  LIST_SEPARATOR,
  PICKUP_URGENCY,
  pickupUrgency,
  rentalProgress,
} from '@xeprime/domain';
import {
  BOOKING_LIST_PRESET,
  BOOKING_STATUS,
  isCancellationParty,
  SERVICE_TYPE,
  type BookingListPreset,
} from '@xeprime/types';
import { ServiceTypeChip } from '@/components/data-display/ServiceTypeChip';
import { LineIcon } from '@/components/icons/LineIcon';
import { bookingPath } from '@/constants/routes';
import { withBranchReturn } from '@/features/branches/branch-link';
import { CustomerContactButtons } from '@/features/booking-requests/components/CustomerContactButtons';
import { CustomerIdentity } from '@/features/booking-requests/components/CustomerIdentity';
import { useListingSpecSummary } from '@/features/booking-requests/hooks/use-listing-spec-summary';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { BookingListItem } from '../types';
import styles from './BookingCard.module.css';

/** Còn ít hơn chừng này tới giờ trả thì dòng tiến độ đổi sang sắc cảnh báo. */
const RETURN_SOON_MINUTES = 120;

type Tone = 'muted' | 'warning' | 'danger';

/**
 * MỘT đơn thuê trên màn "Quản lý đơn thuê xe" — Figma Partner-XePrime "Vehicle Card" của All
 * Request (`23797:48619`, 02/11/2026).
 *
 * DẢI ĐẦU: mã đơn · loại dịch vụ bên trái; giờ nhận → giờ trả, thanh tiến độ và một câu tình
 * trạng bên phải. THÂN: xe · khách + liên hệ · hành động. Câu tình trạng và hành động đi theo
 * NGĂN của đơn (`group`) — nơi gọi biết ngăn vì nó vừa hỏi server đúng ngăn đó.
 *
 * Tổng tiền, tài xế, nơi giao xe chỉ còn ở trang chi tiết (chốt với người dùng 02/11/2026 — sổ
 * cái `09_PARTNER_REDESIGN.md` §3.2 dòng 11).
 */
export function BookingCard({
  booking,
  group,
  branchId,
  canHandle,
  onMessage,
  onExtend,
  messagePending,
  busy,
}: {
  booking: BookingListItem;
  group: BookingListPreset;
  /** Chi nhánh đang lọc — mang sang trang chi tiết làm đường về (ADR 0052). */
  branchId: string | undefined;
  /** Được xác nhận bàn giao (và không ở trong phiên hỗ trợ) — có nút "Xử lý giao xe"/"Nhận xe". */
  canHandle: boolean;
  /** Mở hội thoại với khách. Vắng ⇒ không có nút Nhắn tin. */
  onMessage?: () => void;
  /**
   * Mở hộp "Gia hạn thuê xe" (ADR 0077). Vắng ⇒ không có quyền sửa đơn / đang trong phiên hỗ trợ.
   * Nút chỉ hiện ở đơn DÀI HẠN đang thuê — server vẫn chặn mọi trường hợp khác.
   */
  onExtend?: () => void;
  messagePending: boolean;
  busy: boolean;
}) {
  const t = useTranslations('Bookings.board');
  const tExtension = useTranslations('Bookings.extension');
  const tRequests = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const specs = useListingSpecSummary(booking);
  const titleId = `booking-${booking.id}-title`;
  const detailHref = withBranchReturn(bookingPath.detail(booking.id), branchId);
  const progress = progressOf(booking, group);
  const status = statusLine(booking, group, t, fmt);
  const extendable =
    onExtend !== undefined &&
    group === BOOKING_LIST_PRESET.RENTING &&
    booking.serviceType === SERVICE_TYPE.LONG_TERM &&
    // Chỉ đơn đặt qua chợ: đơn tự lập không có tài khoản khách nhận QR / tiền hoàn (ADR 0077).
    booking.bookingRequestId != null;

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <header className={styles.head}>
        <div className={styles.headMeta}>
          <span className={styles.code}>#{booking.code}</span>
          <ServiceTypeChip value={booking.serviceType} />
        </div>
        <div className={styles.timeline}>
          <span className={styles.period}>
            <TimePoint value={booking.pickupAt} />
            <LineIcon name="arrow-sm" className={styles.arrow} />
            <TimePoint value={booking.returnAt} />
          </span>
          <span
            className={styles.track}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={status.text}
          >
            <span
              className={cx(styles.bar, styles[progress.tone])}
              // Giá trị chỉ biết lúc chạy — ngoại lệ duy nhất được phép của luật cấm inline style.
              style={{ '--progress': `${progress.percent}%` } as React.CSSProperties}
            />
          </span>
          <span className={cx(styles.status, styles[status.tone])}>{status.text}</span>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.vehicle}>
          <span className={styles.thumb}>
            {booking.vehicleImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={booking.vehicleImageUrl}
                alt=""
                loading="lazy"
                className={styles.thumbImage}
              />
            ) : (
              <CarOutlined aria-hidden="true" title={tRequests('vehicle.noImage')} />
            )}
          </span>
          <div className={styles.vehicleText}>
            <p className={styles.vehicleTitle}>
              <span className={styles.vehicleCode}>#{booking.code}</span>
              <span id={titleId} className={styles.vehicleName} title={booking.vehicleName}>
                {booking.vehicleName}
              </span>
            </p>
            {specs.length > 0 ? <p className={styles.specs}>{specs.join(LIST_SEPARATOR)}</p> : null}
            {booking.vehiclePlate ? (
              <span
                className={styles.plate}
                aria-label={t('plate', { plate: booking.vehiclePlate })}
              >
                {booking.vehiclePlate}
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.customer}>
          <span className={styles.zoneLabel}>{t('customer')}</span>
          <div className={styles.customerRow}>
            <CustomerIdentity
              name={booking.customerName}
              nameSource={booking.customerName}
              phone={booking.customerPhone}
              avatarUrl={booking.customerAvatarUrl}
            />
            <CustomerContactButtons
              variant="icon"
              name={booking.customerName}
              phone={booking.customerPhone}
              onMessage={onMessage}
              messageUnavailable={!booking.canMessageOnPlatform}
              messageLoading={messagePending}
              disabled={busy}
            />
          </div>
        </div>

        {/*
          Hành động là LINK có hình nút, không phải `<Button>` bọc trong `<Link>` (một nút nằm trong
          thẻ `<a>` là HTML sai và trình đọc màn hình đọc hai lần). Cả hai đường bàn giao mở trang chi
          tiết — nơi soát việc còn thiếu rồi mới bấm xác nhận; KHÔNG mở sẵn hộp xác nhận (03/11/2026).
        */}
        <div className={styles.actions}>
          {canHandle && group === BOOKING_LIST_PRESET.AWAITING_PICKUP ? (
            <Link
              href={detailHref}
              className={cx(styles.action, styles.handle)}
            >
              {t('handlePickup')}
              <LineIcon name="arrow-sm" className={styles.buttonIcon} />
            </Link>
          ) : (
            <>
              {/*
                Design đặt "Gia hạn" vào chỗ "Nhận xe" trên thẻ dài hạn; ta giữ CẢ HAI — nhận xe về
                vẫn là việc thường ngày của đơn dài hạn (sổ cái §3.2 dòng 12).
              */}
              {extendable ? (
                <button
                  type="button"
                  className={cx(styles.action, styles.extend)}
                  onClick={onExtend}
                  disabled={busy}
                >
                  <SyncOutlined aria-hidden="true" className={styles.buttonIcon} />
                  {tExtension('action')}
                </button>
              ) : null}
              {canHandle && group === BOOKING_LIST_PRESET.RENTING ? (
                <Link
                  href={detailHref}
                  className={cx(styles.action, styles.receive)}
                >
                  <LineIcon name="tick" className={styles.buttonIcon} />
                  {t('receiveBack')}
                </Link>
              ) : null}
              <Link href={detailHref} className={cx(styles.action, styles.detail)}>
                {t('viewDetail')}
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/** "29/10 ⏱ 13:00" — ngày + giờ, giờ Việt Nam. */
function TimePoint({ value }: { value: string }) {
  const fmt = useAppFormat();
  return (
    <span className={styles.timePoint}>
      {fmt.dayMonth(value)}
      <LineIcon name="time-circle" className={styles.clock} />
      {fmt.time(value)}
    </span>
  );
}

/**
 * Thanh tiến độ theo ngăn: chờ giao chưa đi chút nào; đang thuê đo từ lúc xe THẬT SỰ rời tay;
 * hoàn thành đầy; đã huỷ trống (chuyến không diễn ra).
 */
function progressOf(
  booking: BookingListItem,
  group: BookingListPreset,
): { percent: number; tone: 'info' | 'success' | 'danger' | 'empty' } {
  switch (group) {
    case BOOKING_LIST_PRESET.RENTING: {
      const { percent, overdueMinutes } = rentalProgress(
        booking.actualPickupAt ?? booking.pickupAt,
        booking.returnAt,
      );
      return { percent, tone: overdueMinutes > 0 ? 'danger' : 'info' };
    }
    case BOOKING_LIST_PRESET.COMPLETED:
      return { percent: 100, tone: 'success' };
    default:
      return { percent: 0, tone: 'empty' };
  }
}

/** Câu tình trạng ở cuối dải đầu — mỗi ngăn trả lời đúng câu hỏi của ngăn đó. */
function statusLine(
  booking: BookingListItem,
  group: BookingListPreset,
  t: ReturnType<typeof useTranslations<'Bookings.board'>>,
  fmt: ReturnType<typeof useAppFormat>,
): { text: string; tone: Tone } {
  switch (group) {
    case BOOKING_LIST_PRESET.AWAITING_PICKUP: {
      const urgency = pickupUrgency(booking.pickupAt);
      const time = fmt.time(booking.pickupAt);
      if (urgency === PICKUP_URGENCY.OVERDUE)
        return { text: t('pickupOverdue', { time }), tone: 'danger' };
      if (urgency === PICKUP_URGENCY.TODAY)
        return { text: t('pickupToday', { time }), tone: 'warning' };
      return {
        text: t('pickupUpcoming', { date: fmt.dayMonth(booking.pickupAt), time }),
        tone: 'muted',
      };
    }
    case BOOKING_LIST_PRESET.RENTING: {
      const { percent, remainingMinutes, overdueMinutes } = rentalProgress(
        booking.actualPickupAt ?? booking.pickupAt,
        booking.returnAt,
      );
      if (overdueMinutes > 0) {
        return {
          text: t('overdueReturn', { duration: fmt.roughDuration(overdueMinutes) }),
          tone: 'danger',
        };
      }
      return {
        text: t('progress', { percent, remaining: fmt.roughDuration(remainingMinutes) }),
        tone: remainingMinutes <= RETURN_SOON_MINUTES ? 'warning' : 'muted',
      };
    }
    case BOOKING_LIST_PRESET.COMPLETED:
      return isLateReturn(booking.returnAt, booking.actualReturnAt)
        ? { text: t('returnedLate'), tone: 'warning' }
        : { text: t('returnedOnTime'), tone: 'muted' };
    default: {
      if (booking.status === BOOKING_STATUS.NO_SHOW) return { text: t('noShow'), tone: 'danger' };
      const party = booking.cancellationParty;
      return {
        text: party && isCancellationParty(party) ? t(`cancelledBy.${party}`) : t('cancelled'),
        tone: 'danger',
      };
    }
  }
}
