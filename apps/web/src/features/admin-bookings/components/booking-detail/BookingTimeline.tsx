'use client';

import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import {
  BOOKING_TIMELINE_STATE,
  buildBookingTimeline,
  type BookingTimelineState,
} from '../../detail';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

const STEP_CLASS: Readonly<Record<BookingTimelineState, string | undefined>> = {
  [BOOKING_TIMELINE_STATE.DONE]: styles.stepDone,
  [BOOKING_TIMELINE_STATE.TODO]: styles.stepTodo,
  [BOOKING_TIMELINE_STATE.FAILED]: styles.stepFailed,
};

/**
 * "Lịch trình" — dòng mốc ngang + hai ô thời gian dự kiến / thực tế.
 *
 * Mốc nào hiện, mốc nào xong đều do `buildBookingTimeline` quyết từ dữ liệu thật; component chỉ
 * vẽ. Mốc không có giờ (API không ghi) thì không hiện giờ — không mượn giờ của sự kiện khác.
 */
export function BookingTimeline({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.timeline');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const titleId = useId();
  const steps = buildBookingTimeline(booking);

  // Giờ THỰC TẾ chỉ đến từ biên bản bàn giao — không bao giờ lấy giờ tạo đơn thay vào.
  const actual = booking.actualPickupAt
    ? booking.actualReturnAt
      ? fmt.dateTimeRange(booking.actualPickupAt, booking.actualReturnAt)
      : t('actualOngoing', { from: fmt.dateTime(booking.actualPickupAt) })
    : null;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {t('title')}
      </h3>
      <div className={styles.card}>
        {/* Màn hẹp: dòng mốc cuộn ngang trong khung của nó, không đẩy cả panel tràn ngang. */}
        <div className={styles.timelineScroll}>
          <ol className={styles.timeline} aria-label={t('ariaLabel')}>
            {steps.map((step, index) => {
              const done = step.state === BOOKING_TIMELINE_STATE.DONE;
              return (
                <li
                  key={step.key}
                  className={cx(styles.step, STEP_CLASS[step.state])}
                  data-state={step.state}
                >
                  {index > 0 ? (
                    <span
                      className={cx(styles.connector, done && styles.connectorDone)}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className={styles.marker} aria-hidden="true">
                    {done ? (
                      <CheckOutlined />
                    ) : step.state === BOOKING_TIMELINE_STATE.FAILED ? (
                      <CloseOutlined />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className={styles.stepLabel}>{t(`steps.${step.key}`)}</span>
                  {step.at ? (
                    <span className={styles.stepTime}>
                      <span>{fmt.date(step.at)}</span>
                      <span>{fmt.time(step.at)}</span>
                    </span>
                  ) : null}
                  <span className={styles.srOnly}>
                    {done
                      ? t('srDone')
                      : step.state === BOOKING_TIMELINE_STATE.FAILED
                        ? t('srFailed')
                        : t('srTodo')}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className={styles.schedule}>
          <div className={styles.scheduleCell}>
            <div className={styles.scheduleLabel}>{t('planned')}</div>
            <div className={styles.scheduleValue}>
              {fmt.dateTimeRange(booking.pickupAt, booking.returnAt)}
            </div>
          </div>
          <div className={styles.scheduleCell}>
            <div className={styles.scheduleLabel}>{t('actual')}</div>
            <div className={cx(styles.scheduleValue, !actual && styles.scheduleEmpty)}>
              {actual ?? tCommon('states.empty')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
