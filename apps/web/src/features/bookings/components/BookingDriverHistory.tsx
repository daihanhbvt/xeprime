'use client';

import { Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useBookingDriverHistory } from '../hooks/use-booking';
import type { BookingDriverHistoryItem } from '../types';
import { DriverWageInfo } from './DriverWageInfo';
import styles from './BookingDriverSection.module.css';

/**
 * Hộp "Lịch sử gán tài xế" của đơn (Figma `24145:62811`, ADR 0063) — mở từ link ở đầu thẻ Tài xế.
 * Mỗi lượt: chấm (đang mở thì vàng), tên · SĐT, tiền công bên phải; "Gán bởi …, lúc …" và viên kết
 * cục bên dưới. Ngoài design (giữ từ trước): lúc nhận, lý do + vùng của lượt RÚT (ADR 0074), ai kết
 * thúc lượt, và lịch sử sửa tiền công + nút sửa (ADR 0075). Đọc sổ `booking_driver_assignments`.
 */
export function BookingDriverHistoryDialog({
  bookingId,
  subtitle,
  canEditWage,
  onEditWage,
  onClose,
}: {
  bookingId: string;
  /** "Đơn hàng #…, khung giờ". */
  subtitle: string;
  canEditWage: boolean;
  onEditWage: (item: BookingDriverHistoryItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.history');
  const tDialog = useTranslations('Drivers.booking.historyDialog');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const history = useBookingDriverHistory(bookingId, true);

  return (
    <ResponsiveDialog
      title={
        <span>
          {tDialog('title')}
          <span className={styles.dialogSubtitle}>{subtitle}</span>
        </span>
      }
      open
      size="md"
      onClose={onClose}
      footer={<Button onClick={onClose}>{tDialog('close')}</Button>}
    >
      {history.isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : history.isError ? (
        <p className={styles.meta}>{t('loadError')}</p>
      ) : !history.data?.length ? (
        <p className={styles.meta}>{t('empty')}</p>
      ) : (
        <ol className={styles.historyList}>
          {history.data.map((h) => {
            const outcome = h.outcome as DriverAssignmentOutcome;
            const open = outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN;
            return (
              <li key={h.id} className={styles.historyItem}>
                <span className={cx(styles.dot, open && styles.dotOpen)} aria-hidden="true" />
                <div className={styles.historyBody}>
                  <div className={styles.historyLine}>
                    <span>
                      <b>{h.driverName}</b>
                      <span className={styles.meta}> {h.driverPhone}</span>
                    </span>
                    {h.wage.amount !== null ? (
                      <b className={styles.money}>{fmt.money(h.wage.amount)}</b>
                    ) : null}
                  </div>
                  <div className={styles.historyLine}>
                    <span className={styles.meta}>
                      {h.assignedByName
                        ? tDialog('assignedBy', {
                            name: h.assignedByName,
                            time: fmt.dateTime(h.assignedAt),
                          })
                        : tDialog('assignedBySystem', { time: fmt.dateTime(h.assignedAt) })}
                    </span>
                    <StatusBadge
                      value={outcome}
                      meta={DRIVER_ASSIGNMENT_OUTCOME_META}
                      group="driverAssignmentOutcome"
                    />
                  </div>
                  {h.acceptedAt ? (
                    <span className={styles.meta}>
                      {t('acceptedAt', { time: fmt.dateTime(h.acceptedAt) })}
                    </span>
                  ) : null}
                  {h.dropReasonCategory ? (
                    <span>
                      {t('dropReason', {
                        reason: domainLabel('driverDropReason', h.dropReasonCategory),
                      })}
                      {h.dropReason ? ` ${t('dropNote', { note: h.dropReason })}` : ''}
                    </span>
                  ) : null}
                  {h.dropZone ? (
                    <span className={styles.meta}>
                      {t('dropZone', { zone: domainLabel('driverDropZone', h.dropZone) })}
                    </span>
                  ) : null}
                  {h.endedAt ? (
                    <span className={styles.meta}>
                      {h.endedByName
                        ? t('endedBy', { name: h.endedByName, time: fmt.dateTime(h.endedAt) })
                        : t('endedAt', { time: fmt.dateTime(h.endedAt) })}
                    </span>
                  ) : null}
                  {h.wage.changes.length > 0 || (canEditWage && h.wage.editable) ? (
                    <DriverWageInfo
                      wage={h.wage}
                      canEdit={canEditWage}
                      onEdit={() => onEditWage(h)}
                      hideLine
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </ResponsiveDialog>
  );
}
