'use client';

import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DASHBOARD_AGENDA_DAYS, DASHBOARD_AGENDA_KIND } from '@xeprime/types';
import { LIST_SEPARATOR, toAppTz, type Dayjs } from '@xeprime/domain';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoCard } from '@/components/layout/InfoCard';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { groupAgenda } from '../dashboard-model';
import type { PartnerAgendaItem, PartnerOverviewAgenda } from '../types';
import { HeadLink } from './HeadLink';
import styles from './AgendaPanel.module.css';

type AgendaTab = 'all' | 'overdue' | 'today' | 'upcoming';
const TABS: readonly AgendaTab[] = ['all', 'overdue', 'today', 'upcoming'];

interface AgendaRowModel {
  item: PartnerAgendaItem;
  overdue: boolean;
}

/**
 * "Lịch giao & nhận xe" — Figma `24138:80394`: bốn tab (Tất cả · Quá giờ · Hôm nay · N ngày tới)
 * kèm số, bảng Thời gian · Loại · Xe · Trạng thái · Thao tác, link "Xem tất cả trong Đơn thuê xe".
 *
 * Cùng phép chia tab với `AgendaPanel` của app Partner (`groupAgenda` theo mốc `generatedAt` của
 * server): quá giờ → "Trễ N ngày/giờ/phút", còn lại "Sắp tới". Cột "Hình thức giao/nhận" của bản
 * vẽ CỐ Ý vắng — API chưa trả (chốt với người dùng 17/11/2026).
 */
export function AgendaPanel({
  agenda,
  generatedAt,
  isError,
  onRetry,
  bookingHref,
  moreHref,
}: {
  agenda: PartnerOverviewAgenda | undefined;
  generatedAt: string | undefined;
  isError: boolean;
  onRetry: () => void;
  bookingHref: (id: string) => string;
  moreHref: string;
}) {
  const t = useTranslations('Dashboard.agenda');
  const [tab, setTab] = useState<AgendaTab>('all');
  const now = useMemo(() => (generatedAt ? dayjs(generatedAt) : dayjs()), [generatedAt]);

  const buckets = useMemo(() => {
    const result: Record<AgendaTab, AgendaRowModel[]> = {
      all: [],
      overdue: [],
      today: [],
      upcoming: [],
    };
    if (!agenda) return result;
    for (const group of groupAgenda(agenda.items, now)) {
      const overdue = group.kind === 'overdue';
      for (const item of group.items) {
        const row = { item, overdue };
        result.all.push(row);
        if (overdue) result.overdue.push(row);
        else if (group.kind === 'today') result.today.push(row);
        else result.upcoming.push(row);
      }
    }
    return result;
  }, [agenda, now]);

  const hasItems = buckets.all.length > 0;
  const rows = buckets[tab];

  const tabs = hasItems ? (
    <div className={styles.tabs} role="tablist" aria-label={t('title')}>
      {TABS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          className={cx(styles.tab, tab === key && styles.tabActive)}
          onClick={() => setTab(key)}
        >
          {key === 'upcoming'
            ? t('tabs.upcoming', { days: DASHBOARD_AGENDA_DAYS })
            : t(`tabs.${key}`)}
          <span
            className={cx(
              styles.tabCount,
              key === 'overdue' && buckets.overdue.length > 0 && styles.tabUrgent,
            )}
          >
            {buckets[key].length}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  let body;
  if (!agenda) {
    body = isError ? (
      <EmptyState variant="error" title={t('loadError')} onRetry={onRetry} />
    ) : (
      <Skeleton active title={false} paragraph={{ rows: 5 }} />
    );
  } else if (!hasItems) {
    body = (
      <EmptyState
        variant="empty"
        title={t('empty', { days: DASHBOARD_AGENDA_DAYS })}
        description={t('emptyHint')}
      />
    );
  } else if (rows.length === 0) {
    body = <p className={styles.tabEmpty}>{t(`tabEmpty.${tab as Exclude<AgendaTab, 'all'>}`)}</p>;
  } else {
    body = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('columns.time')}</th>
              <th>{t('columns.kind')}</th>
              <th>{t('columns.vehicle')}</th>
              <th>{t('columns.status')}</th>
              <th className={styles.actionsCol}>{t('columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <AgendaRow
                key={`${row.item.kind}-${row.item.bookingId}`}
                row={row}
                now={now}
                href={bookingHref(row.item.bookingId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <InfoCard title={t('title')} extra={tabs}>
      {body}
      {hasItems ? (
        <div className={styles.foot}>
          <HeadLink href={moreHref} label={t('moreAll')} />
        </div>
      ) : null}
    </InfoCard>
  );
}

function AgendaRow({ row, now, href }: { row: AgendaRowModel; now: Dayjs; href: string }) {
  const t = useTranslations('Dashboard.agenda');
  const fmt = useAppFormat();
  const { item, overdue } = row;
  const pickup = item.kind === DASHBOARD_AGENDA_KIND.PICKUP;
  const kindLabel = t(pickup ? 'kind.pickup' : 'kind.return');
  const at = toAppTz(item.at);
  const vehicle = item.plateNumber
    ? `${item.vehicleName}${LIST_SEPARATOR}${item.plateNumber}`
    : item.vehicleName;

  return (
    <tr>
      <td>
        <span className={styles.time}>{fmt.time(item.at)}</span>
        <span className={styles.sub}>
          {t('dayLabel', { weekday: fmt.weekdayShort(at), date: fmt.dayMonth(item.at) })}
        </span>
      </td>
      <td>
        <span className={cx(styles.pill, pickup ? styles.pillInfo : styles.pillSuccess)}>
          {kindLabel}
        </span>
      </td>
      <td>
        <span className={styles.vehicle}>{vehicle}</span>
        <span className={styles.sub}>{item.customerName}</span>
      </td>
      <td>
        <span
          className={cx(
            styles.pill,
            styles.dotPill,
            overdue ? styles.pillDanger : styles.pillWarning,
          )}
        >
          {overdue ? lateLabel(t, at, now) : t('upcoming')}
        </span>
      </td>
      <td className={styles.actionsCol}>
        <Link
          href={href}
          className={styles.detail}
          aria-label={t('itemAria', {
            kind: kindLabel,
            vehicle,
            customer: item.customerName,
            time: fmt.shortDateTime(item.at),
          })}
        >
          {t('detail')}
        </Link>
      </td>
    </tr>
  );
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** Cùng bậc với app Partner: ≥1 ngày → ngày, ≥1 giờ → giờ, còn lại phút (tối thiểu 1). */
function lateLabel(
  t: ReturnType<typeof useTranslations<'Dashboard.agenda'>>,
  at: Dayjs,
  now: Dayjs,
): string {
  const minutes = Math.max(1, now.diff(at, 'minute'));
  if (minutes >= MINUTES_PER_DAY)
    return t('lateDays', { count: Math.floor(minutes / MINUTES_PER_DAY) });
  if (minutes >= MINUTES_PER_HOUR)
    return t('lateHours', { count: Math.floor(minutes / MINUTES_PER_HOUR) });
  return t('lateMinutes', { count: minutes });
}
