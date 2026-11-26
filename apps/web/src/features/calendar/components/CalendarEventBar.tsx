'use client';

import { Button, Popover } from 'antd';
import { CheckCircleFilled, CloseOutlined, LockOutlined, ToolOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS_META,
  isMarketplaceBooking,
  OCCUPANCY_SOURCE_TYPE_META,
  PERMISSION,
  SERVICE_TYPE,
  STATUS_COLOR,
  VEHICLE_BLOCK_REASON_META,
  type StatusColor,
  type BookingStatus,
  type OccupancySourceType,
  type VehicleBlockReason,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  BookingSourceChip,
  bookingSourceToneClass,
  useBookingSourceText,
} from '@/components/data-display/BookingSourceChip';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { ServiceTypeChip } from '@/components/data-display/ServiceTypeChip';
import { CustomerContactButtons } from '@/features/booking-requests/components/CustomerContactButtons';
import { useBooking } from '@/features/bookings/hooks/use-booking';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { dayjs, toAppTz, type Dayjs } from '@/lib/datetime';
import type { CalendarEvent, CalendarResource } from '../types/calendar.types';
import {
  STAGE_STATUS_COLOR,
  eventKind,
  eventStage,
  isOccupying,
  serviceTone,
  type ServiceTone,
} from '../utils/calendar-event-model';
import { RENTAL_STAGE, type RentalStage } from '@/constants/rental-stages';
import styles from './CalendarScheduler.module.css';

const TONE_CLASS: Record<ServiceTone, string | undefined> = {
  selfDrive: styles.toneSelfDrive,
  withDriver: styles.toneWithDriver,
  longTerm: styles.toneLongTerm,
  neutral: styles.toneNeutral,
};

const CHIP_CLASS: Partial<Record<StatusColor, string | undefined>> = {
  [STATUS_COLOR.DANGER]: styles.chipDanger,
  [STATUS_COLOR.WARNING]: styles.chipWarning,
  [STATUS_COLOR.INFO]: styles.chipInfo,
  [STATUS_COLOR.SUCCESS]: styles.chipSuccess,
};

/** Nhãn nhóm của một event — cùng khoá với màn "Đơn thuê xe" (`Bookings.board.stage.*`). */
function useStageLabel() {
  const tBoard = useTranslations('Bookings.board');
  return (stage: RentalStage) => tBoard(`stage.${stage}`);
}

/**
 * Một thẻ trên lưới (design `24200:99389`): vạch màu dịch vụ bên trái · chip nhóm "Đơn thuê xe" +
 * mã + thời lượng · số tiền + khách · giờ nhận → trả. Khoá xe / bảo dưỡng là thẻ xám nét đứt.
 *
 * Rê chuột / focus mở thẻ xem nhanh; BẤM mở chi tiết đầy đủ (đơn · yêu cầu · khoá · bảo dưỡng) mà
 * không rời lịch. Màu không phải tín hiệu duy nhất: chip có chữ, khoá/bảo dưỡng có icon, yêu cầu
 * chờ duyệt (không chiếm lịch) có viền đứt.
 */
export function CalendarEventBar({
  event,
  resource,
  left,
  width,
  top,
  clippedStart,
  clippedEnd,
  compact,
  onOpen,
}: {
  event: CalendarEvent;
  resource: CalendarResource;
  left: number;
  width: number;
  top: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  /** Điện thoại: thẻ thấp, bỏ dòng giờ. */
  compact: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const stageLabel = useStageLabel();
  const sourceText = useBookingSourceText();
  const [tipOpen, setTipOpen] = useState(false);

  const kind = eventKind(event);
  const source = eventSource(event);
  const sourceName = source ? sourceText(source.code, source.label) : null;
  const paid = eventPaidLabel(event, t);
  const off = kind === 'blocked' || kind === 'maintenance';
  const stage = eventStage(event);
  const pending = !isOccupying(event);
  const start = toAppTz(event.startAt);
  const end = toAppTz(event.endAt);

  const ariaLabel = [
    stage ? stageLabel(stage) : offLabel(),
    event.customerName,
    event.code,
    sourceName ? t('event.sourceAria', { source: sourceName }) : null,
    paid,
    t('eventCard.barAriaRange', { start: fmt.rentalPoint(start), end: fmt.rentalPoint(end) }),
  ]
    .filter(Boolean)
    .join(', ');

  function offLabel(): string {
    return kind === 'maintenance'
      ? domainLabel(
          'occupancySourceType',
          event.type,
          OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType]?.label,
        )
      : t('event.blocked');
  }

  return (
    <Popover
      content={
        <EventQuickCard
          event={event}
          resource={resource}
          enabled={tipOpen}
          onClose={() => setTipOpen(false)}
          onOpen={() => {
            setTipOpen(false);
            onOpen();
          }}
        />
      }
      placement="top"
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.25}
      open={tipOpen}
      onOpenChange={setTipOpen}
    >
      <button
        type="button"
        className={cx(
          styles.eventBar,
          off ? styles.eventOff : TONE_CLASS[serviceTone(event.serviceType)],
          pending && styles.eventPending,
          clippedStart && styles.clippedStart,
          clippedEnd && styles.clippedEnd,
          compact && styles.eventCompact,
        )}
        // Toạ độ chỉ biết lúc runtime — ngoại lệ hợp lệ của "không inline style" (ADR 0003).
        style={
          {
            '--xp-bar-left': `${left}px`,
            '--xp-bar-width': `${width}px`,
            '--xp-bar-top': `${top}px`,
          } as React.CSSProperties
        }
        aria-label={ariaLabel}
        onClick={() => {
          setTipOpen(false);
          onOpen();
        }}
      >
        {off ? (
          <span className={styles.eventBody}>
            <span className={styles.eventHeadStart}>
              {kind === 'maintenance' ? (
                <ToolOutlined className={styles.offIcon} aria-hidden />
              ) : (
                <LockOutlined className={styles.offIcon} aria-hidden />
              )}
              <span className={styles.offLabel}>{offLabel()}</span>
            </span>
            <span className={styles.offReason}>
              {offReason(event, domainLabel, fmt, start, end)}
            </span>
          </span>
        ) : (
          <>
            <span className={styles.indicator} aria-hidden />
            <span className={styles.eventBody}>
              <span className={styles.eventHead}>
                <span className={styles.eventHeadStart}>
                  {stage ? (
                    <span className={cx(styles.stageChip, CHIP_CLASS[STAGE_STATUS_COLOR[stage]])}>
                      {stageLabel(stage)}
                    </span>
                  ) : event.status ? (
                    <span className={styles.stageChip}>
                      {domainLabel(
                        'bookingStatus',
                        event.status,
                        BOOKING_STATUS_META[event.status as BookingStatus]?.label,
                      )}
                    </span>
                  ) : null}
                  {event.code ? <span className={styles.eventCode}>#{event.code}</span> : null}
                  <EventRemaining event={event} />
                </span>
                {end.diff(start, 'day') >= 1 ? (
                  <span className={styles.eventSpan}>{fmt.rentalDuration(start, end)}</span>
                ) : null}
              </span>
              <span className={styles.eventMain}>
                {event.amount ? (
                  <span className={styles.eventAmount}>
                    <span className={styles.amountFull}>{fmt.money(event.amount)}</span>
                    <span className={styles.amountCompact}>{fmt.moneyCompact(event.amount)}</span>
                  </span>
                ) : null}
                <EventPaidMark event={event} />
                {source && sourceName ? (
                  <span
                    className={cx(styles.sourceMark, bookingSourceToneClass(source.code))}
                    title={sourceName}
                    aria-hidden
                  >
                    {sourceInitial(sourceName)}
                  </span>
                ) : null}
                <span className={styles.eventCustomer}>
                  {event.customerName ?? t('event.customerHidden')}
                </span>
              </span>
              <span className={styles.eventTime}>{timeRange(fmt, event, start, end, t)}</span>
            </span>
          </>
        )}
      </button>
    </Popover>
  );
}

/**
 * Nguồn của một thẻ (ADR 0110): đơn mang nguồn của nó; yêu cầu (chờ duyệt / đang giữ chỗ) luôn tới
 * từ sàn. Khoá xe và bảo dưỡng không có nguồn.
 */
function eventSource(event: CalendarEvent): { code: string; label: string | null } | null {
  const kind = eventKind(event);
  // Đơn qua sàn (và yêu cầu - luôn qua sàn) là nguồn MẶC ĐỊNH: không dấu, không dòng nguồn.
  if (kind === 'booking' && event.bookingSource && !isMarketplaceBooking(event.bookingSource)) {
    return { code: event.bookingSource, label: event.bookingSourceLabel ?? null };
  }
  return null;
}

/** Chữ cái đầu của tên nguồn - dấu nhận nhanh trên thẻ hẹp, mang màu của nguồn. */
function sourceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** Câu thanh toán của một ĐƠN: thu đủ / đã thu n% / chưa thu. `null` với mọi thẻ không phải đơn. */
function eventPaidLabel(event: CalendarEvent, t: CalendarT): string | null {
  const percent = event.paidPercent;
  if (eventKind(event) !== 'booking' || percent == null) return null;
  if (percent >= 100) return t('event.paidFull');
  return percent > 0 ? t('event.paidPartial', { percent }) : t('event.unpaid');
}

/**
 * Dấu thanh toán trên thẻ đơn: thu đủ ⇒ dấu tích xanh, thu một phần ⇒ số phần trăm, chưa thu ⇒ không
 * có gì (thẻ không gánh thêm một dấu cho trạng thái mặc định). Số do SERVER tính (`paidPercent`).
 */
function EventPaidMark({ event }: { event: CalendarEvent }) {
  const t = useTranslations('Calendar');
  const percent = event.paidPercent;
  if (eventKind(event) !== 'booking' || percent == null || percent <= 0) return null;
  if (percent >= 100) {
    return (
      <CheckCircleFilled className={styles.paidFull} title={t('event.paidFull')} aria-hidden />
    );
  }
  return (
    <span className={styles.paidPartial} title={t('event.paidPartial', { percent })} aria-hidden>
      {percent}%
    </span>
  );
}

/** "Còn: 12 ngày 19 giờ" — chỉ đơn DÀI HẠN đang chạy (design thẻ tím). */
function EventRemaining({ event }: { event: CalendarEvent }) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  if (event.serviceType !== SERVICE_TYPE.LONG_TERM || eventStage(event) !== RENTAL_STAGE.RENTING) {
    return null;
  }
  const now = dayjs();
  const end = toAppTz(event.endAt);
  if (!end.isAfter(now)) return null;
  return (
    <span className={styles.eventRemaining}>
      {t.rich('event.remaining', {
        duration: fmt.rentalDuration(now, end),
        b: (chunks) => <strong>{chunks}</strong>,
      })}
    </span>
  );
}

type AppFormat = ReturnType<typeof useAppFormat>;
type DomainLabel = ReturnType<typeof useDomainLabel>;
type CalendarT = ReturnType<typeof useTranslations<'Calendar'>>;

/**
 * Dòng giờ của thẻ: cùng một ngày ⇒ chỉ giờ (`11h00 → 17h00`); khác ngày ⇒ hai mốc chuẩn
 * (`T6, 13/10 11h00 → T7, 14/10 17h00`); dài hạn ⇒ hai NGÀY có năm (`12/10/2026 → 12/11/2026`).
 */
function timeRange(
  fmt: AppFormat,
  event: CalendarEvent,
  start: Dayjs,
  end: Dayjs,
  t: CalendarT,
): string {
  if (event.serviceType === SERVICE_TYPE.LONG_TERM) {
    return t('event.timeRange', { from: fmt.date(event.startAt), to: fmt.date(event.endAt) });
  }
  if (start.isSame(end, 'day')) {
    return t('event.timeRange', { from: fmt.rentalTime(start), to: fmt.rentalTime(end) });
  }
  return fmt.rentalRange(event.startAt, event.endAt);
}

function offReason(
  event: CalendarEvent,
  domainLabel: DomainLabel,
  fmt: AppFormat,
  start: Dayjs,
  end: Dayjs,
): string {
  if (eventKind(event) === 'blocked' && event.status) {
    return domainLabel(
      'vehicleBlockReason',
      event.status,
      VEHICLE_BLOCK_REASON_META[event.status as VehicleBlockReason]?.label,
    );
  }
  return fmt.rentalRange(start.toISOString(), end.toISOString());
}

/**
 * Thẻ "Chi tiết nhanh" (design `24200:99396`). Đơn: khách + dịch vụ + SĐT + mã · Xe · Nhận · Trả ·
 * Giá trị đơn · "Đã trả tiền giữ chỗ" · "Liên hệ khách" + "Chi tiết đơn".
 *
 * SĐT KHÔNG nằm trong dữ liệu lưới: nó đi qua cổng `hostSeesCustomerContact` của chi tiết đơn
 * (ADR 0056), nên thẻ nạp chi tiết đơn khi MỞ — và chỉ khi người xem có quyền xem đơn. Yêu cầu chưa
 * thành đơn không có SĐT ở đây: chi tiết yêu cầu tự quyết theo cổng của nó.
 */
function EventQuickCard({
  event,
  resource,
  enabled,
  onClose,
  onOpen,
}: {
  event: CalendarEvent;
  resource: CalendarResource;
  /** Thẻ đang mở — chỉ lúc đó mới nạp chi tiết đơn. */
  enabled: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const stageLabel = useStageLabel();
  const { has } = usePermissions();
  const kind = eventKind(event);
  const stage = eventStage(event);
  const isBooking = kind === 'booking';
  const detail = useBooking(
    enabled && isBooking && has(PERMISSION.BOOKING_VIEW) && event.sourceId ? event.sourceId : null,
  );
  const phone = isBooking ? (detail.data?.customerPhone ?? null) : null;
  const holdPaid = Number(detail.data?.holdPaidAmount ?? 0) > 0;
  const start = toAppTz(event.startAt);
  const end = toAppTz(event.endAt);

  const heading =
    kind === 'booking'
      ? t('eventCard.bookingHeading')
      : kind === 'request'
        ? t('eventCard.requestHeading')
        : domainLabel(
            'occupancySourceType',
            event.type,
            OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType]?.label,
          );

  const badge = stage ? (
    <ToneDotBadge color={STAGE_STATUS_COLOR[stage]}>{stageLabel(stage)}</ToneDotBadge>
  ) : kind === 'blocked' && event.status ? (
    <ToneDotBadge color={STATUS_COLOR.NEUTRAL}>
      {domainLabel(
        'vehicleBlockReason',
        event.status,
        VEHICLE_BLOCK_REASON_META[event.status as VehicleBlockReason]?.label,
      )}
    </ToneDotBadge>
  ) : event.status && isBooking ? (
    <ToneDotBadge color={BOOKING_STATUS_META[event.status as BookingStatus]?.color}>
      {domainLabel('bookingStatus', event.status)}
    </ToneDotBadge>
  ) : null;

  const hasPerson = kind === 'booking' || kind === 'request';
  const source = eventSource(event);
  const paid = eventPaidLabel(event, t);

  return (
    <div className={styles.quickCard}>
      <div className={styles.quickHead}>
        <span className={styles.quickHeading}>{heading}</span>
        <span className={styles.quickHeadEnd}>
          {badge}
          <QuickClose onClose={onClose} />
        </span>
      </div>

      {hasPerson ? (
        <div className={styles.quickWho}>
          <div className={styles.quickWhoTop}>
            <span className={styles.quickName}>
              {event.customerName ?? t('event.customerHidden')}
            </span>
            {event.serviceType ? <ServiceTypeChip value={event.serviceType} /> : null}
          </div>
          {phone || event.code ? (
            <div className={styles.quickWhoSub}>
              {phone ? <span>{phone}</span> : null}
              {event.code ? <span className={styles.quickCode}>#{event.code}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <dl className={styles.quickRows}>
        <div className={styles.quickRow}>
          <dt>{t('eventCard.vehicle')}</dt>
          <dd>
            {resource.name}
            {resource.plateNumber ? (
              <>
                {' '}
                <span className={styles.quickPlateSep}>|</span>{' '}
                <span className={styles.quickPlate}>{resource.plateNumber}</span>
              </>
            ) : null}
          </dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{t(hasPerson ? 'eventCard.pickupAt' : 'eventCard.startAt')}</dt>
          <dd>{fmt.rentalPoint(start)}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{t(hasPerson ? 'eventCard.returnAt' : 'eventCard.endAt')}</dt>
          <dd>{fmt.rentalPoint(end)}</dd>
        </div>
        {event.amount ? (
          <div className={styles.quickRow}>
            <dt>{t('eventCard.amount')}</dt>
            <dd>{fmt.money(event.amount)}</dd>
          </div>
        ) : !hasPerson ? (
          <div className={styles.quickRow}>
            <dt>{t('eventCard.duration')}</dt>
            <dd>{fmt.rentalDuration(start, end)}</dd>
          </div>
        ) : null}
        {paid ? (
          <div className={styles.quickRow}>
            <dt>{t('eventCard.payment')}</dt>
            <dd>{paid}</dd>
          </div>
        ) : null}
        {source ? (
          <div className={styles.quickRow}>
            <dt>{t('eventCard.source')}</dt>
            <dd>
              <BookingSourceChip source={source.code} sourceLabel={source.label} size="sm" />
            </dd>
          </div>
        ) : null}
        {holdPaid ? <span className={styles.quickPaid}>{t('eventCard.holdPaid')}</span> : null}
      </dl>

      <div className={styles.quickActions}>
        {phone && event.customerName ? (
          <Popover
            trigger="click"
            placement="bottom"
            content={
              <div className={styles.contactPopover}>
                <CustomerContactButtons variant="labeled" name={event.customerName} phone={phone} />
              </div>
            }
          >
            <Button>{t('eventCard.contact')}</Button>
          </Popover>
        ) : null}
        <Button type="primary" onClick={onOpen}>
          {kind === 'booking'
            ? t('eventCard.openBooking')
            : kind === 'request'
              ? t('eventCard.openRequest')
              : t('eventCard.openDetail')}
        </Button>
      </div>
    </div>
  );
}

/** Nút X tường minh của thẻ xem nhanh — chạm trên điện thoại không có "rời chuột" để tự tắt. */
export function QuickClose({ onClose }: { onClose: () => void }) {
  const tCommon = useTranslations('Common');
  return (
    <button
      type="button"
      className={styles.quickClose}
      aria-label={tCommon('actions.close')}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <CloseOutlined />
    </button>
  );
}

/** Nối tên + biển số cho tiêu đề bảng thao tác / hộp thoại: `Kia K3 · 51G-010.19`. */
export function vehicleTitle(resource: Pick<CalendarResource, 'name' | 'plateNumber'>): string {
  return resource.plateNumber
    ? `${resource.name}${LIST_SEPARATOR}${resource.plateNumber}`
    : resource.name;
}
