'use client';

import {
  CheckOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, App, Avatar, Button } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY,
  canTransitionBooking,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_ASSIGNMENT_STATUS_META,
  DRIVER_INCIDENT_LEVEL,
  DRIVER_LICENCE_STATE,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  DRIVER_SOURCE,
  DRIVER_WAGE_STAGE,
  holdRemainingMs,
  isDriverMissingAlertDue,
  isDriverReassignable,
  longClockText,
  PERMISSION,
  SERVICE_TYPE,
  type BookingStatus,
  type DriverAssignmentStatus,
} from '@xeprime/types';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { useNow } from '@/hooks/use-now';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { telHref } from '@/lib/contact';
import { cx } from '@/lib/cx';
import { useBookingDriverHistory, useDriverWageQuote } from '../hooks/use-booking';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import type { BookingDetail, BookingDriverHistoryItem, BookingDriverIncident } from '../types';
import { BookingDriverHistoryDialog } from './BookingDriverHistory';
import { BookingStatusTransitionDialog } from './BookingStatusTransitionDialog';
import { ChangeDriverDialog } from './ChangeDriverDialog';
import { DriverWageEditDialog } from './DriverWageEditDialog';
import styles from './BookingDriverSection.module.css';

/** Nhịp của đồng hồ hạn nhận chuyến — hiện cả giây (Figma "30:15"). */
const CLOCK_TICK_MS = 1_000;
/** Dưới mốc này đồng hồ đổi sắc thái khẩn. */
const RESPOND_URGENT_MS = 5 * 60_000;

/**
 * Thẻ "Tài xế" trên chi tiết đơn — Figma `23807:73143` (ADR 0063 · ADR 0074 · ADR 0075 · ADR 0108).
 *
 * CHỈ đơn `with_driver` mới có tài xế: đơn khác ẩn hẳn thẻ, trừ khi còn một tài xế gán từ trước
 * (dữ liệu cũ) — khi đó hiện chỉ-đọc để không ai mất dấu người đang cầm xe.
 *
 * Khung tài xế: ảnh · tên · SĐT · bằng lái (liên kết) hoặc nhãn nguồn (nội bộ / ngoài hệ thống) ·
 * menu "…" (Đổi tài xế · Sửa tiền công · Gỡ tài xế). Lượt đang chờ nhận: khung vàng "Chờ tài xế nhận
 * chuyến - Gán lúc …, hạn …" + đồng hồ đếm ngược (ADR 0066). Dòng "Tiền công (xN ngày)" (ADR 0075 —
 * XePrime chỉ ghi nhận). Link "Lịch sử gán tài xế" mở hộp lịch sử.
 *
 * Tài xế ĐÃ NHẬN rồi rút ⇒ thẻ SỰ CỐ: ai rút, vì sao, hạn điều phối lại; quá hạn hoặc sát giờ thì
 * nói rõ khách đang được huỷ hoàn 100% tính cho bên thuê, kèm lối "Huỷ chuyến do thiếu tài xế".
 */
export function BookingDriverSection({
  booking,
  canUpdate,
}: {
  booking: BookingDetail;
  canUpdate: boolean;
}) {
  const t = useTranslations('Drivers.booking');
  const tCard = useTranslations('Drivers.booking.card');
  const tWage = useTranslations('Drivers.wage');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const fmt = useAppFormat();
  const now = useNow();
  const [picking, setPicking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editingWage, setEditingWage] = useState<BookingDriverHistoryItem | null>(null);
  const assign = useAssignBookingDriver(booking.id);

  const isWithDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const driver = booking.driver ?? null;
  const isExternal = driver?.source === DRIVER_SOURCE.EXTERNAL;
  // Tài xế nội bộ (ADR 0108): đã nhận ngay như tài xế ngoài hệ thống, nhưng chọn từ danh bạ.
  const isInternal = driver?.source === DRIVER_SOURCE.INTERNAL;
  const incident = booking.driverIncident ?? null;

  // Lịch sử lượt gán mang tiền công của lượt ĐANG MỞ — tải luôn cho đơn có tài xế (nhỏ, một đơn).
  const historyQ = useBookingDriverHistory(booking.id, isWithDriver);
  const openItem =
    historyQ.data?.find((h) => h.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN) ?? null;
  // Số ngày của đơn đổi sau khi gán (đổi lịch) — server không tự tính lại tiền công, chỉ nhắc.
  const quoteQ = useDriverWageQuote(booking.id, isWithDriver && canUpdate && openItem !== null);
  const daysChanged =
    openItem?.wage.days != null && quoteQ.data && quoteQ.data.days !== openItem.wage.days
      ? { from: openItem.wage.days, to: quoteQ.data.days }
      : null;

  if (!isWithDriver && !driver) return null;
  const reassignable = isDriverReassignable(booking.status);
  // Đã giao xe / đã khép ⇒ người cầm lái đã chốt: chỉ đọc (server cũng chặn — DRIVER_ASSIGNMENT_LOCKED).
  const canWrite = canUpdate && isWithDriver && reassignable;
  // Bộ chọn đọc `/drivers/assignable` (DRIVER_VIEW) — thiếu quyền thì không bày nút, như app native.
  const canPick = canWrite && has(PERMISSION.DRIVER_VIEW);
  const canEditWage = canUpdate && Boolean(openItem?.wage.editable);
  const canCancel =
    canUpdate && canTransitionBooking(booking.status as BookingStatus, BOOKING_STATUS.CANCELLED);
  // Thẻ sự cố đã nói việc cần làm — không chồng thêm cảnh báo "sắp tới giờ chưa có tài xế".
  const missingSoon =
    !incident &&
    isWithDriver &&
    reassignable &&
    isDriverMissingAlertDue(
      { pickupAt: booking.pickupAt, hasDriver: driver !== null },
      new Date(now),
    );

  function unassign() {
    if (assign.isPending) return;
    assign.mutate(
      { driverId: null },
      {
        onSuccess: () => message.success(t('unassignedToast')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const menu: RowAction[] = [
    {
      key: 'change',
      label: t('change'),
      icon: <SwapOutlined />,
      hidden: !canPick,
      onClick: () => setPicking(true),
    },
    {
      key: 'wage',
      label:
        openItem?.wage.stage === DRIVER_WAGE_STAGE.NOT_RUN
          ? tWage('edit.actionAgreed')
          : tCard('editWage'),
      icon: <EditOutlined />,
      hidden: !canEditWage || !openItem,
      onClick: () => openItem && setEditingWage(openItem),
    },
    {
      key: 'unassign',
      label: t('unassign'),
      icon: <DeleteOutlined />,
      danger: true,
      hidden: !canWrite,
      loading: assign.isPending,
      confirm: { title: t('unassignConfirm'), okText: t('unassign') },
      onClick: unassign,
    },
  ];

  const pending =
    driver?.source === DRIVER_SOURCE.LINKED &&
    driver.assignmentStatus === DRIVER_ASSIGNMENT_STATUS.PENDING;
  const driverTel = driver ? telHref(driver.phone) : null;
  const rangeLabel = fmt.rentalRange(booking.pickupAt, booking.returnAt);

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.blockTitle}>{t('title')}</h2>
        {isWithDriver ? (
          <button type="button" className={styles.textAction} onClick={() => setHistoryOpen(true)}>
            <FileTextOutlined aria-hidden="true" />
            {tCard('historyLink')}
          </button>
        ) : null}
      </div>

      {!isWithDriver ? <p className={styles.meta}>{t('legacyHint')}</p> : null}

      {incident ? (
        <DriverIncidentAlert
          incident={incident}
          action={
            canCancel ? (
              <Button size="small" danger onClick={() => setCancelling(true)}>
                {t('incident.cancelForDriver')}
              </Button>
            ) : null
          }
        />
      ) : null}

      {missingSoon ? (
        <Alert
          className={styles.alert}
          type="warning"
          showIcon
          title={t('missingSoon', { hours: DRIVER_MISSING_ALERT_LEAD_MINUTES / 60 })}
        />
      ) : null}

      {driver ? (
        <div className={styles.box}>
          <div className={styles.driverRow}>
            <Avatar
              size={36}
              src={driver.avatarUrl ?? undefined}
              icon={driver.avatarUrl ? undefined : <UserOutlined />}
            />
            <span className={styles.who}>
              <span className={styles.name}>{driver.name}</span>
              {driverTel ? (
                <a href={driverTel} className={styles.phone}>
                  {driver.phone}
                </a>
              ) : (
                <span className={styles.phone}>{driver.phone}</span>
              )}
            </span>
            <SourceBadge driver={driver} />
            <RowActions actions={menu} maxInline={0} overflowLabel={tCard('menu')} />
          </div>

          {pending ? (
            <div className={styles.pendingBox}>
              <ClockCircleOutlined className={styles.pendingIcon} aria-hidden="true" />
              <span className={styles.pendingText}>
                <b>{tCard('pendingTitle')}</b>
                <span>
                  {driver.respondBy
                    ? tCard('pendingTime', {
                        assigned: fmt.time(driver.assignedAt),
                        deadline: fmt.shortDateTime(driver.respondBy),
                      })
                    : t('assignedAt', { time: fmt.dateTime(driver.assignedAt) })}
                </span>
              </span>
              {driver.respondBy ? <RespondClock deadline={driver.respondBy} /> : null}
            </div>
          ) : (
            <p className={styles.meta}>
              {isInternal || isExternal
                ? t('externalSetAt', { time: fmt.dateTime(driver.assignedAt) })
                : driver.respondedAt
                  ? tCard('accepted', { time: fmt.dateTime(driver.respondedAt) })
                  : t('assignedAt', { time: fmt.dateTime(driver.assignedAt) })}
            </p>
          )}

          {isExternal && canWrite ? <p className={styles.meta}>{t('externalLegacy')}</p> : null}

          {isInternal ? (
            <p className={styles.meta}>{tCard('internalNoWage')}</p>
          ) : openItem && openItem.wage.amount !== null ? (
            <div className={styles.wageRow}>
              <span>
                {openItem.wage.stage === DRIVER_WAGE_STAGE.NOT_RUN
                  ? tCard('wageAgreed')
                  : tCard('wageLine', { days: openItem.wage.days ?? 1 })}
              </span>
              <b>{fmt.money(openItem.wage.amount)}</b>
            </div>
          ) : null}
          {daysChanged ? (
            <span className={styles.deadline}>{tWage('daysChanged', daysChanged)}</span>
          ) : null}
        </div>
      ) : (
        <div className={cx(styles.box, styles.emptyBox)}>
          {/* Đơn có tài xế chưa phân công nghĩa là chưa chạy được — nhắc bằng màu cảnh báo. */}
          <span className={styles.missing}>{t('unassigned')}</span>
          <span className={styles.meta}>{tCard('emptyHint')}</span>
          {canPick ? (
            <Button type="primary" icon={<CheckOutlined />} onClick={() => setPicking(true)}>
              {t('assign')}
            </Button>
          ) : null}
        </div>
      )}

      {picking ? <ChangeDriverDialog booking={booking} onClose={() => setPicking(false)} /> : null}
      {historyOpen ? (
        <BookingDriverHistoryDialog
          bookingId={booking.id}
          subtitle={tCard('historySubtitle', { code: booking.code, range: rangeLabel })}
          canEditWage={canUpdate}
          onEditWage={(item) => setEditingWage(item)}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
      {editingWage ? (
        <DriverWageEditDialog
          bookingId={booking.id}
          item={editingWage}
          status={
            editingWage.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN && driver?.assignmentStatus ? (
              <StatusBadge
                value={driver.assignmentStatus as DriverAssignmentStatus}
                meta={DRIVER_ASSIGNMENT_STATUS_META}
                group="driverAssignmentStatus"
              />
            ) : undefined
          }
          onClose={() => setEditingWage(null)}
        />
      ) : null}

      {/* Dựng có điều kiện: mỗi lần mở là một form mới, nhóm lý do chọn sẵn "thiếu tài xế". */}
      {cancelling ? (
        <BookingStatusTransitionDialog
          booking={booking}
          target={BOOKING_STATUS.CANCELLED}
          defaultReasonCategory={CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE}
          open
          onClose={() => setCancelling(false)}
        />
      ) : null}
    </section>
  );
}

/** Bằng lái (tài xế liên kết) hoặc nhãn nguồn (nội bộ / ngoài hệ thống) ở góc khung tài xế. */
function SourceBadge({ driver }: { driver: NonNullable<BookingDetail['driver']> }) {
  const t = useTranslations('Drivers.booking');
  const tCard = useTranslations('Drivers.booking.card');
  if (driver.source === DRIVER_SOURCE.INTERNAL) {
    return <span className={styles.sourceTag}>{t('internalTag')}</span>;
  }
  if (driver.source === DRIVER_SOURCE.EXTERNAL) {
    return <span className={styles.sourceTag}>{t('externalTag')}</span>;
  }
  const licence = driver.licence;
  if (!licence) return null;
  if (licence.state === DRIVER_LICENCE_STATE.VERIFIED) {
    return (
      <span className={cx(styles.licence, styles.licenceOk)}>
        <CheckOutlined aria-hidden="true" />
        {licence.classes.length > 0
          ? tCard('licence', { classes: licence.classes.join(', ') })
          : tCard('licenceVerified')}
      </span>
    );
  }
  return <span className={cx(styles.licence, styles.licenceBad)}>{tCard('licenceUnverified')}</span>;
}

/** Đồng hồ "30:15" tới hạn tài xế trả lời (ADR 0066) — mốc do server chốt, đây chỉ đếm. */
function RespondClock({ deadline }: { deadline: string }) {
  const tCard = useTranslations('Drivers.booking.card');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (holdRemainingMs(deadline) <= 0) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (holdRemainingMs(deadline) <= 0) clearInterval(timer);
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);
  const remaining = holdRemainingMs(deadline, new Date(now));
  if (remaining <= 0) return null;
  const clock = longClockText(remaining);
  return (
    <span
      className={cx(styles.clock, remaining < RESPOND_URGENT_MS && styles.clockUrgent)}
      aria-label={tCard('countdown', { time: clock })}
      suppressHydrationWarning
    >
      {clock}
    </span>
  );
}

/**
 * Thẻ SỰ CỐ TÀI XẾ (ADR 0074) — mọi mốc do server tính (`reassignBy`, `customerCanCancelFree`),
 * ở đây chỉ đọc. Màu theo độ khẩn: khách đã được huỷ miễn phí ⇒ đỏ; còn trong hạn ⇒ vàng.
 */
function DriverIncidentAlert({
  incident,
  action,
}: {
  incident: BookingDriverIncident;
  action: ReactNode;
}) {
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
    <Alert
      className={styles.alert}
      type={incident.customerCanCancelFree ? 'error' : 'warning'}
      showIcon
      title={
        incident.driverName ? t('titleNamed', { name: incident.driverName }) : t('titleReleased')
      }
      description={
        <div className={styles.stack}>
          {reason ? <span>{reason}</span> : null}
          <span className={styles.meta}>
            {t('droppedAt', { time: fmt.dateTime(incident.droppedAt) })}
          </span>
          <span className={styles.strong}>{deadline}</span>
        </div>
      }
      action={action}
    />
  );
}
