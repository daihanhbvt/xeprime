'use client';

import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DashboardLinks } from '../hooks/use-dashboard-links';
import type { PartnerOverview } from '../types';
import { FocusTile } from './FocusTile';
import styles from './TodayFocus.module.css';

const ICON = {
  requests: '/partner/dashboard/tile-requests.svg',
  payment: '/partner/dashboard/tile-payment.svg',
  pickup: '/partner/dashboard/tile-pickup.svg',
  active: '/partner/dashboard/tile-active.svg',
} as const;

/**
 * Bốn ô VIỆC CẦN LÀM — Figma `24138:80355`. Cùng phép tính, cùng chữ với `TodayFocus` của app
 * Partner: số quá hạn lên viên đỏ cạnh số (`*Short`), dòng phụ là hạn trả lời gần nhất / số hẹn
 * hôm nay. Ô nào người xem không có quyền (server trả `null`) thì vắng.
 */
export function TodayFocus({
  overview,
  isError,
  links,
}: {
  overview: PartnerOverview | undefined;
  isError: boolean;
  links: DashboardLinks;
}) {
  const t = useTranslations('Dashboard.focus');
  const fmt = useAppFormat();

  const failed = isError && !overview;
  const countOf = (value: number | undefined): number | null | undefined =>
    failed ? null : overview ? (value ?? 0) : undefined;

  const showRequests = !overview || overview.requests !== null;
  const showBookings = !overview || overview.today !== null;
  if (!showRequests && !showBookings) return null;

  const requests = overview?.requests ?? null;
  const today = overview?.today ?? null;

  return (
    <section className={styles.grid} aria-label={t('title')}>
      {showRequests ? (
        <>
          <FocusTile
            icon={ICON.requests}
            tone="danger"
            label={t('requests.label')}
            count={countOf(requests?.pending)}
            href={links.requests}
            {...(requests && requests.pendingUrgent > 0
              ? { badge: t('requests.urgentShort', { count: requests.pendingUrgent }) }
              : {})}
            lines={
              requests?.nextRespondBy
                ? [
                    {
                      key: 'next',
                      text: t('requests.next', { time: fmt.shortDateTime(requests.nextRespondBy) }),
                    },
                  ]
                : []
            }
            emptyText={t('requests.none')}
          />
          <FocusTile
            icon={ICON.payment}
            tone="warning"
            label={t('awaitingPayment.label')}
            count={countOf(requests?.awaitingPayment)}
            href={links.awaitingPayment}
            lines={[{ key: 'hint', text: t('awaitingPayment.hint') }]}
            emptyText={t('awaitingPayment.none')}
          />
        </>
      ) : null}
      {showBookings ? (
        <>
          <FocusTile
            icon={ICON.pickup}
            tone="info"
            label={t('pickups.label')}
            count={countOf(today?.awaitingPickup)}
            href={links.awaitingPickup}
            {...(today && today.pickupsOverdue > 0
              ? { badge: t('pickups.overdueShort', { count: today.pickupsOverdue }) }
              : {})}
            lines={
              today && today.pickupsToday > 0
                ? [{ key: 'today', text: t('pickups.today', { count: today.pickupsToday }) }]
                : []
            }
            emptyText={t('pickups.none')}
          />
          <FocusTile
            icon={ICON.active}
            tone="success"
            label={t('active.label')}
            count={countOf(today?.active)}
            href={links.active}
            {...(today && today.returnsOverdue > 0
              ? { badge: t('active.overdueShort', { count: today.returnsOverdue }) }
              : {})}
            lines={
              today && today.returnsToday > 0
                ? [{ key: 'today', text: t('active.returnsToday', { count: today.returnsToday }) }]
                : []
            }
            emptyText={t('active.none')}
          />
        </>
      ) : null}
    </section>
  );
}
