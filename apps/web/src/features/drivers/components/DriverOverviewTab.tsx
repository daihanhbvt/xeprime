'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS } from '@xeprime/types';
import { moneyChangePercent } from '@xeprime/domain';
import { ChangeBadge } from '@/features/dashboard/components/ChangeBadge';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import type { DriverOverview } from '../types';
import { DriverUpcomingTrips, DriverWageBars } from './DriverDetailParts';
import { DRIVER_MONTH_FORMAT } from './DriverMonthPicker';
import styles from './DriverDetail.module.css';

/**
 * Tab Tổng quan của trang chi tiết tài xế liên kết — Figma `24042:71009`. Mọi số đến từ MỘT lần
 * đọc `GET /drivers/:id/overview`, nên bốn thẻ số, biểu đồ, "Chuyến sắp tới" và thẻ tiền công luôn
 * khớp nhau. Tiền công là số GHI NHẬN (ADR 0075) — không con số nào ở đây là tiền XePrime giữ.
 *
 * Tỉ lệ nhận chỉ là phần trăm khi có ít nhất một lượt để đo; "chưa được gán lần nào" khác "được
 * gán mà không nhận", nên không có lượt nào thì hiện "-", không phải 0%.
 */
export function DriverOverviewTab({ overview }: { overview: DriverOverview }) {
  const t = useTranslations('Drivers.detailPage.overview');
  const tOld = useTranslations('Drivers.detail.overview');
  const fmt = useAppFormat();
  const { driver, month, upcoming, current, reliability, trend } = overview;
  const monthLabel = fmt.monthYear(dayjs(month.month, DRIVER_MONTH_FORMAT).toDate());
  const previous = trend.length >= 2 ? trend[trend.length - 2] : undefined;
  // "Chuyến sắp chạy" = đơn đang gán mà xe CHƯA giao (đơn đang thuê là chuyến đang chạy).
  const notStarted = current.filter((trip) => trip.bookingStatus !== BOOKING_STATUS.ACTIVE);
  const nearest = notStarted[0];

  return (
    <>
      <div className={styles.kpis}>
        <StatCard
          label={t('kpi.wage')}
          value={fmt.money(month.wageTotal)}
          icon={DollarOutlined}
          tone="gold"
          change={
            <ChangeBadge value={moneyChangePercent(month.wageTotal, previous?.wageTotal ?? null)} />
          }
        />
        <StatCard
          label={t('kpi.completed')}
          value={fmt.count(month.completedTrips)}
          hint={t('kpi.completedHint', { count: month.drivenDays })}
          icon={CheckCircleOutlined}
          tone="green"
        />
        <StatCard
          label={t('kpi.average')}
          value={month.averageDailyWage == null ? '-' : fmt.money(month.averageDailyWage)}
          hint={t('kpi.averageHint', { count: month.drivenDays })}
          icon={LineChartOutlined}
          tone="blue"
        />
        <StatCard
          label={t('kpi.upcoming')}
          value={fmt.count(notStarted.length)}
          hint={
            nearest
              ? t('kpi.upcomingNearest', { time: fmt.dateTime(nearest.pickupAt) })
              : t('kpi.upcomingNone')
          }
          icon={ClockCircleOutlined}
          tone="blue"
        />
      </div>

      <div className={styles.overviewGrid}>
        <div className={styles.column}>
          <DriverWageBars overview={overview} />
          <DriverUpcomingTrips trips={current} total={driver.activeBookingCount} showWage />
        </div>

        <section className={styles.card} aria-label={t('wage.title')}>
          <h3 className={styles.cardTitle}>
            {t('wage.title')} · {monthLabel}
          </h3>
          <dl className={styles.kv}>
            <div>
              <dt>{tOld('wage.completed', { count: month.completedTrips })}</dt>
              <dd>{fmt.money(month.completedWage)}</dd>
            </div>
            {/* Ngoài design (giữ từ 04/11): số thoả thuận của chuyến đã nhận mà không chạy. */}
            {month.agreedTrips > 0 ? (
              <div>
                <dt>{tOld('wage.agreed', { count: month.agreedTrips })}</dt>
                <dd>{fmt.money(month.agreedWage)}</dd>
              </div>
            ) : null}
            <div>
              <dt>{tOld('wage.edited')}</dt>
              <dd>{tOld('wage.editedValue', { count: month.editedTrips })}</dd>
            </div>
          </dl>
          <p className={styles.smallNote}>{tOld('wage.note')}</p>

          <div className={styles.divider} />

          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>{t('reliability.title')}</h3>
            <span className={styles.cardHint}>
              {t('reliability.window', { days: reliability.windowDays })}
            </span>
          </div>
          <div className={styles.rateRow}>
            <span className={styles.rateValue}>
              {reliability.acceptRate == null ? '-' : `${fmt.count(reliability.acceptRate)}%`}
            </span>
            <div className={styles.rateBar}>
              <span>
                {t('reliability.rateLabel')}
                {reliability.decided > 0
                  ? ` · ${t('reliability.rateOf', {
                      accepted: reliability.accepted,
                      decided: reliability.decided,
                    })}`
                  : ` · ${tOld('reliability.noSample')}`}
              </span>
              <Progress
                percent={reliability.acceptRate ?? 0}
                showInfo={false}
                size="small"
                status="success"
              />
            </div>
          </div>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span>{t('reliability.response')}</span>
              <b>
                {reliability.medianResponseMinutes == null
                  ? '-'
                  : reliability.medianResponseMinutes === 0
                    ? tOld('reliability.underMinute')
                    : fmt.minutesDuration(reliability.medianResponseMinutes)}
              </b>
            </div>
            <div className={styles.tile}>
              <span>{t('reliability.declined')}</span>
              <b>{t('reliability.times', { count: reliability.declined })}</b>
            </div>
            <div className={styles.tile}>
              <span>{t('reliability.expired')}</span>
              <b className={reliability.expired > 0 ? styles.warnText : undefined}>
                {t('reliability.trips', { count: reliability.expired })}
              </b>
            </div>
            <div className={styles.tile}>
              <span>{t('reliability.pending')}</span>
              <b>{t('reliability.trips', { count: upcoming.pendingTrips })}</b>
            </div>
          </div>
          {/* Ngoài design (giữ từ 04/11, ADR 0074): rút chuyến đã nhận + loại khỏi "Đặt ngay". */}
          {driver.dropCount > 0 || driver.autoAssignCooldownUntil ? (
            <dl className={styles.kv}>
              {driver.dropCount > 0 ? (
                <div>
                  <dt>{tOld('reliability.drops')}</dt>
                  <dd className={driver.criticalDropCount > 0 ? styles.dangerText : styles.warnText}>
                    {tOld('reliability.dropsValue', {
                      count: driver.dropCount,
                      critical: driver.criticalDropCount,
                    })}
                  </dd>
                </div>
              ) : null}
              {driver.autoAssignCooldownUntil ? (
                <div>
                  <dt>{tOld('reliability.cooldown')}</dt>
                  <dd className={styles.warnText}>{fmt.dateTime(driver.autoAssignCooldownUntil)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>
      </div>
    </>
  );
}
