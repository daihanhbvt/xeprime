'use client';

import { Collapse, Skeleton, Tag, Timeline } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useBookingDriverHistory } from '../hooks/use-booking';
import styles from './BookingDriverSection.module.css';

/**
 * Lịch sử gán tài xế của đơn (ADR 0063) — thu gọn mặc định, mở ra mới tải. Mỗi lượt: ai được gán,
 * ai gán (hoặc hệ thống "Đặt ngay"), lúc nhận, và kết thúc ra sao. Đọc sổ
 * `booking_driver_assignments`, không suy từ audit.
 */
export function BookingDriverHistory({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Drivers.history');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [open, setOpen] = useState(false);
  const history = useBookingDriverHistory(bookingId, open);

  const body = history.isLoading ? (
    <Skeleton active paragraph={{ rows: 2 }} />
  ) : history.isError ? (
    <p className={styles.meta}>{t('loadError')}</p>
  ) : !history.data?.length ? (
    <p className={styles.meta}>{t('empty')}</p>
  ) : (
    <Timeline
      items={history.data.map((h) => {
        const outcome = h.outcome as DriverAssignmentOutcome;
        return {
          key: h.id,
          color: outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN ? 'blue' : 'gray',
          children: (
            <div className={styles.stack}>
              <span>
                <span className={styles.strong}>{h.driverName}</span> · {h.driverPhone}{' '}
                <Tag color={DRIVER_ASSIGNMENT_OUTCOME_META[outcome]?.color}>
                  {domainLabel('driverAssignmentOutcome', h.outcome)}
                </Tag>
              </span>
              <span className={styles.meta}>
                {h.assignedByName
                  ? t('assignedBy', { name: h.assignedByName, time: fmt.dateTime(h.assignedAt) })
                  : t('assignedBySystem', { time: fmt.dateTime(h.assignedAt) })}
              </span>
              {h.acceptedAt ? (
                <span className={styles.meta}>
                  {t('acceptedAt', { time: fmt.dateTime(h.acceptedAt) })}
                </span>
              ) : null}
              {h.endedAt ? (
                <span className={styles.meta}>
                  {h.endedByName
                    ? t('endedBy', { name: h.endedByName, time: fmt.dateTime(h.endedAt) })
                    : t('endedAt', { time: fmt.dateTime(h.endedAt) })}
                </span>
              ) : null}
            </div>
          ),
        };
      })}
    />
  );

  return (
    <Collapse
      ghost
      size="small"
      className={styles.history}
      activeKey={open ? ['history'] : []}
      onChange={(keys) => setOpen((Array.isArray(keys) ? keys : [keys]).includes('history'))}
      items={[{ key: 'history', label: t('title'), children: body }]}
    />
  );
}
