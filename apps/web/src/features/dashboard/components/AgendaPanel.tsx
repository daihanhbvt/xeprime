'use client';

import { CalendarOutlined, RightOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DASHBOARD_AGENDA_DAYS, DASHBOARD_AGENDA_KIND } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { groupAgenda, type AgendaGroup } from '../dashboard-model';
import type { PartnerAgendaItem, PartnerOverviewAgenda } from '../types';
import { DashboardPanel } from './DashboardPanel';
import styles from './AgendaPanel.module.css';

/**
 * "Lịch giao & nhận xe" — việc kế tiếp theo GIỜ, gom theo ngày: quá giờ → hôm nay → ngày mai →
 * các ngày sau, trong `DASHBOARD_AGENDA_DAYS` ngày tới.
 *
 * Mỗi dòng là một `<Link>` tới chi tiết đơn (`/bookings/<id>` — màn dùng chung hai tuyến, nơi bàn
 * giao xe), nên từ Tổng quan tới nút "Giao xe" là đúng một cú bấm.
 *
 * `agenda === undefined` là đang tải (hoặc lỗi chưa có dữ liệu cũ); thiếu quyền xem đơn thì nơi
 * gọi không dựng panel này.
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
  /** Mốc "bây giờ" của server — chia nhóm theo CÙNG thời điểm với con số trên các ô việc. */
  generatedAt: string | undefined;
  isError: boolean;
  onRetry: () => void;
  bookingHref: (id: string) => string;
  moreHref: string;
}) {
  const t = useTranslations('Dashboard.agenda');

  let body;
  if (!agenda) {
    body = isError ? (
      <EmptyState variant="error" title={t('loadError')} onRetry={onRetry} />
    ) : (
      <Skeleton active title={false} paragraph={{ rows: 4 }} />
    );
  } else if (agenda.items.length === 0) {
    body = (
      <EmptyState
        variant="empty"
        title={t('empty', { days: DASHBOARD_AGENDA_DAYS })}
        description={t('emptyHint')}
      />
    );
  } else {
    const now = generatedAt ? dayjs(generatedAt) : dayjs();
    body = (
      <div className={styles.groups}>
        {groupAgenda(agenda.items, now).map((group) => (
          <AgendaGroupBlock key={group.key} group={group} bookingHref={bookingHref} />
        ))}
      </div>
    );
  }

  return (
    <DashboardPanel
      title={t('title')}
      icon={<CalendarOutlined />}
      extra={<span className={styles.window}>{t('window', { days: DASHBOARD_AGENDA_DAYS })}</span>}
    >
      {body}
      {agenda && agenda.items.length > 0 ? (
        <div className={styles.foot}>
          <Link href={moreHref} className={styles.more}>
            {t('more')}
            <RightOutlined aria-hidden />
          </Link>
        </div>
      ) : null}
    </DashboardPanel>
  );
}

function AgendaGroupBlock({
  group,
  bookingHref,
}: {
  group: AgendaGroup;
  bookingHref: (id: string) => string;
}) {
  const t = useTranslations('Dashboard.agenda');
  const fmt = useAppFormat();
  const overdue = group.kind === 'overdue';

  let heading: string;
  if (group.kind === 'overdue') heading = t('overdue');
  else if (group.kind === 'today') heading = t('today');
  else if (group.kind === 'tomorrow') heading = t('tomorrow');
  else if (group.day) heading = `${fmt.weekdayLong(group.day)} · ${fmt.dateKey(group.key)}`;
  else heading = group.key;

  return (
    <section className={styles.group} aria-label={heading}>
      <h3 className={cx(styles.groupTitle, overdue && styles.groupOverdue)}>
        {heading}
        <span className={styles.groupCount}>{group.items.length}</span>
      </h3>
      <ul className={styles.list}>
        {group.items.map((item) => (
          <AgendaRow
            key={`${item.kind}-${item.bookingId}`}
            item={item}
            overdue={overdue}
            href={bookingHref(item.bookingId)}
          />
        ))}
      </ul>
    </section>
  );
}

function AgendaRow({
  item,
  overdue,
  href,
}: {
  item: PartnerAgendaItem;
  overdue: boolean;
  href: string;
}) {
  const t = useTranslations('Dashboard.agenda');
  const fmt = useAppFormat();
  const pickup = item.kind === DASHBOARD_AGENDA_KIND.PICKUP;
  const kindLabel = t(pickup ? 'kind.pickup' : 'kind.return');
  // Mốc quá giờ có thể từ hôm qua — phải kèm NGÀY, không chỉ giờ.
  const when = overdue ? fmt.shortDateTime(item.at) : fmt.time(item.at);
  const vehicle = item.plateNumber ? `${item.vehicleName} · ${item.plateNumber}` : item.vehicleName;

  return (
    <li>
      <Link
        href={href}
        className={cx(styles.row, overdue && styles.rowOverdue)}
        aria-label={t('itemAria', {
          kind: kindLabel,
          vehicle,
          customer: item.customerName,
          time: when,
        })}
      >
        <span className={styles.time}>{when}</span>
        <span className={cx(styles.kind, pickup ? styles.kindPickup : styles.kindReturn)}>
          {kindLabel}
        </span>
        <span className={styles.main}>
          <span className={styles.vehicle}>{vehicle}</span>
          <span className={styles.sub}>
            {item.customerName} · {item.code}
          </span>
        </span>
        <RightOutlined className={styles.chevron} aria-hidden />
      </Link>
    </li>
  );
}
