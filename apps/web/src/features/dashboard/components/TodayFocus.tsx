'use client';

import { CarOutlined, InboxOutlined, KeyOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DashboardLinks } from '../hooks/use-dashboard-links';
import type { PartnerOverview } from '../types';
import { ActionTile, type ActionTileMeta } from './ActionTile';
import styles from './TodayFocus.module.css';

/**
 * Hàng ĐẦU của Tổng quan partner — việc cần làm, không phải KPI (UX §1.5). Bốn ô theo đúng thứ
 * tự một chuyến đi qua tay chủ xe: duyệt yêu cầu → chờ khách trả tiền giữ chỗ → giao xe → nhận
 * lại xe.
 *
 * Ô của khối mà người xem không có quyền thì vắng hẳn (không vẽ "0"): `overview.requests === null`
 * nghĩa là "không được xem", khác với "không có yêu cầu nào".
 *
 * `overview === undefined` ⇒ bốn ô ở trạng thái tải; `isError` khi chưa có dữ liệu cũ ⇒ ô hiện
 * "—" + câu lỗi nhưng VẪN dẫn tới danh sách — việc vẫn phải làm dù con số tạm thời không có.
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
  /** `undefined` = đang tải, `null` = lỗi, số = có dữ liệu. */
  const countOf = (value: number | undefined): number | null | undefined =>
    failed ? null : overview ? (value ?? 0) : undefined;

  // Thiếu quyền ⇒ vắng ô. Khi CHƯA có dữ liệu thì chưa biết — vẫn dựng ô ở trạng thái tải.
  const showRequests = !overview || overview.requests !== null;
  const showBookings = !overview || overview.today !== null;

  const requests = overview?.requests ?? null;
  const today = overview?.today ?? null;

  const requestMeta: ActionTileMeta[] = [];
  if (requests && requests.pendingUrgent > 0) {
    requestMeta.push({
      key: 'urgent',
      text: t('requests.urgent', { count: requests.pendingUrgent }),
      urgent: true,
    });
  }
  if (requests?.nextRespondBy) {
    requestMeta.push({
      key: 'next',
      text: t('requests.next', { time: fmt.shortDateTime(requests.nextRespondBy) }),
    });
  }

  const pickupMeta: ActionTileMeta[] = [];
  if (today && today.pickupsOverdue > 0) {
    pickupMeta.push({
      key: 'overdue',
      text: t('pickups.overdue', { count: today.pickupsOverdue }),
      urgent: true,
    });
  }
  if (today && today.pickupsToday > 0) {
    pickupMeta.push({ key: 'today', text: t('pickups.today', { count: today.pickupsToday }) });
  }

  const activeMeta: ActionTileMeta[] = [];
  if (today && today.returnsOverdue > 0) {
    activeMeta.push({
      key: 'overdue',
      text: t('active.overdue', { count: today.returnsOverdue }),
      urgent: true,
    });
  }
  if (today && today.returnsToday > 0) {
    activeMeta.push({ key: 'today', text: t('active.returnsToday', { count: today.returnsToday }) });
  }

  if (!showRequests && !showBookings) return null;

  return (
    <section className={styles.grid} aria-label={t('title')}>
      {showRequests ? (
        <>
          <ActionTile
            icon={InboxOutlined}
            label={t('requests.label')}
            count={countOf(requests?.pending)}
            href={links.requests}
            tone={requests && requests.pendingUrgent > 0 ? 'urgent' : 'attention'}
            meta={requestMeta}
            emptyText={t('requests.none')}
            errorText={t('loadError')}
          />
          <ActionTile
            icon={WalletOutlined}
            label={t('awaitingPayment.label')}
            count={countOf(requests?.awaitingPayment)}
            href={links.awaitingPayment}
            tone="attention"
            meta={[{ key: 'hint', text: t('awaitingPayment.hint') }]}
            emptyText={t('awaitingPayment.none')}
            errorText={t('loadError')}
          />
        </>
      ) : null}
      {showBookings ? (
        <>
          <ActionTile
            icon={CarOutlined}
            label={t('pickups.label')}
            count={countOf(today?.awaitingPickup)}
            href={links.awaitingPickup}
            tone={today && today.pickupsOverdue > 0 ? 'urgent' : 'attention'}
            meta={pickupMeta}
            emptyText={t('pickups.none')}
            errorText={t('loadError')}
          />
          <ActionTile
            icon={KeyOutlined}
            label={t('active.label')}
            count={countOf(today?.active)}
            href={links.active}
            tone={today && today.returnsOverdue > 0 ? 'urgent' : 'attention'}
            meta={activeMeta}
            emptyText={t('active.none')}
            errorText={t('loadError')}
          />
        </>
      ) : null}
    </section>
  );
}
