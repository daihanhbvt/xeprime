'use client';

import { Button, Pagination, Skeleton } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, type ReactNode } from 'react';
import {
  DRIVER_CENTER_VIEW,
  DRIVER_CENTER_VIEW_PARAM,
  DRIVER_TRIP_TAB,
  type DriverCenterView,
  type DriverTripTab,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDriverTrips, useMyDriverLinks } from '../hooks';
import { DRIVER_LINK_SCOPE, type DriverLinkScope } from '../types';
import { SegmentTabs } from './DriverCenterParts';
import { DriverLinkCard } from './DriverLinkCard';
import { DrivingTripCard } from './DrivingTripCard';
import styles from './DriverCenter.module.css';

/** Tham số URL của tab con và trang — đổi khu thì cả hai về mặc định. */
const TAB_PARAM = 'tab';
const PAGE_PARAM = 'page';

/**
 * "Trung tâm Tài xế" (`/account/driving`) — Figma `21768:51021`. Một thẻ `AccountPanel`, góc phải là
 * bộ chuyển hai khu "Chuyến xe của tôi | Chủ xe đối tác"; mỗi khu có hai tab con kèm số đếm.
 * Khu, tab và trang đều sống trên URL (ADR 0004) — chia sẻ được, F5 không mất chỗ.
 */
export function DriverCenterPage() {
  return (
    <Suspense fallback={null}>
      <DriverCenterInner />
    </Suspense>
  );
}

function DriverCenterInner() {
  const t = useTranslations('Driving.center');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const view: DriverCenterView =
    params?.get(DRIVER_CENTER_VIEW_PARAM) === DRIVER_CENTER_VIEW.PARTNERS
      ? DRIVER_CENTER_VIEW.PARTNERS
      : DRIVER_CENTER_VIEW.TRIPS;
  const rawTab = params?.get(TAB_PARAM) ?? null;
  const page = Math.max(1, Number(params?.get(PAGE_PARAM) ?? 1) || 1);

  function navigate(next: { view?: DriverCenterView; tab?: string | null; page?: number }) {
    const search = new URLSearchParams(params?.toString() ?? '');
    const nextView = next.view ?? view;
    if (nextView === DRIVER_CENTER_VIEW.TRIPS) search.delete(DRIVER_CENTER_VIEW_PARAM);
    else search.set(DRIVER_CENTER_VIEW_PARAM, nextView);
    // Đổi khu ⇒ tab về mặc định; đổi tab ⇒ trang về 1.
    const tab = next.view !== undefined ? null : next.tab !== undefined ? next.tab : rawTab;
    if (tab) search.set(TAB_PARAM, tab);
    else search.delete(TAB_PARAM);
    const nextPage = next.view !== undefined || next.tab !== undefined ? 1 : (next.page ?? page);
    if (nextPage <= 1) search.delete(PAGE_PARAM);
    else search.set(PAGE_PARAM, String(nextPage));
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <AccountPanel
      as="h1"
      title={t('title')}
      subtitle={t('subtitle')}
      extra={
        <SegmentTabs<DriverCenterView>
          size="view"
          label={t('viewLabel')}
          value={view}
          onChange={(next) => navigate({ view: next })}
          items={[
            { value: DRIVER_CENTER_VIEW.TRIPS, label: t('viewTrips') },
            { value: DRIVER_CENTER_VIEW.PARTNERS, label: t('viewPartners') },
          ]}
        />
      }
    >
      {view === DRIVER_CENTER_VIEW.TRIPS ? (
        <TripsSection
          tab={rawTab === DRIVER_TRIP_TAB.PAST ? DRIVER_TRIP_TAB.PAST : DRIVER_TRIP_TAB.UPCOMING}
          page={page}
          onTab={(tab) => navigate({ tab: tab === DRIVER_TRIP_TAB.UPCOMING ? null : tab })}
          onPage={(next) => navigate({ page: next })}
        />
      ) : (
        <PartnersSection
          scope={rawTab === DRIVER_LINK_SCOPE.CLOSED ? DRIVER_LINK_SCOPE.CLOSED : DRIVER_LINK_SCOPE.OPEN}
          page={page}
          onScope={(scope) => navigate({ tab: scope === DRIVER_LINK_SCOPE.OPEN ? null : scope })}
          onPage={(next) => navigate({ page: next })}
        />
      )}
    </AccountPanel>
  );
}

function TripsSection({
  tab,
  page,
  onTab,
  onPage,
}: {
  tab: DriverTripTab;
  page: number;
  onTab: (tab: DriverTripTab) => void;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('Driving.center');
  const tTrips = useTranslations('Driving.trips');
  const upcoming = tab === DRIVER_TRIP_TAB.UPCOMING;
  const current = useDriverTrips(tab, page);
  // Số của tab kia — trang 1 là đủ, chỉ đọc `meta.total`.
  const other = useDriverTrips(upcoming ? DRIVER_TRIP_TAB.PAST : DRIVER_TRIP_TAB.UPCOMING, 1);
  const totalOf = (which: DriverTripTab) =>
    (which === tab ? current.data : other.data)?.meta.total;

  return (
    <>
      <SegmentTabs<DriverTripTab>
        size="tab"
        label={t('tabsLabel')}
        value={tab}
        onChange={onTab}
        countLabel={(label, count) => t('tabLabel', { label, count })}
        items={[
          {
            value: DRIVER_TRIP_TAB.UPCOMING,
            label: t('tabTripsCurrent'),
            count: totalOf(DRIVER_TRIP_TAB.UPCOMING),
          },
          {
            value: DRIVER_TRIP_TAB.PAST,
            label: t('tabTripsEnded'),
            count: totalOf(DRIVER_TRIP_TAB.PAST),
          },
        ]}
      />
      <ListState
        query={current}
        loadError={tTrips('loadError')}
        retry={tTrips('retry')}
        emptyTitle={upcoming ? tTrips('emptyUpcomingTitle') : tTrips('emptyPastTitle')}
        emptyBody={upcoming ? tTrips('emptyUpcomingBody') : undefined}
        onPage={onPage}
        render={(trip) => <DrivingTripCard trip={trip} />}
      />
    </>
  );
}

function PartnersSection({
  scope,
  page,
  onScope,
  onPage,
}: {
  scope: DriverLinkScope;
  page: number;
  onScope: (scope: DriverLinkScope) => void;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('Driving.center');
  const tLinks = useTranslations('Driving.links');
  const open = scope === DRIVER_LINK_SCOPE.OPEN;
  const current = useMyDriverLinks(scope, page);
  const other = useMyDriverLinks(open ? DRIVER_LINK_SCOPE.CLOSED : DRIVER_LINK_SCOPE.OPEN, 1);
  const totalOf = (which: DriverLinkScope) =>
    (which === scope ? current.data : other.data)?.meta.total;

  return (
    <>
      <SegmentTabs<DriverLinkScope>
        size="tab"
        label={t('tabsLabel')}
        value={scope}
        onChange={onScope}
        countLabel={(label, count) => t('tabLabel', { label, count })}
        items={[
          {
            value: DRIVER_LINK_SCOPE.OPEN,
            label: t('tabPartnersOpen'),
            count: totalOf(DRIVER_LINK_SCOPE.OPEN),
          },
          {
            value: DRIVER_LINK_SCOPE.CLOSED,
            label: t('tabPartnersClosed'),
            count: totalOf(DRIVER_LINK_SCOPE.CLOSED),
          },
        ]}
      />
      <ListState
        query={current}
        loadError={tLinks('loadError')}
        retry={tLinks('retry')}
        emptyTitle={open ? tLinks('emptyOpenTitle') : tLinks('emptyClosedTitle')}
        emptyBody={open ? tLinks('emptyOpenBody') : undefined}
        onPage={onPage}
        render={(link) => <DriverLinkCard link={link} />}
      />
    </>
  );
}

/** Tải / lỗi / rỗng / danh sách + phân trang — một khuôn cho cả hai khu. */
function ListState<T extends { id: string }>({
  query,
  loadError,
  retry,
  emptyTitle,
  emptyBody,
  onPage,
  render,
}: {
  query: {
    data?: { items: T[]; meta: { page: number; limit: number; total: number } };
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  loadError: string;
  retry: string;
  emptyTitle: string;
  emptyBody?: string;
  onPage: (page: number) => void;
  render: (item: T) => ReactNode;
}) {
  const errorMessage = useErrorMessage();
  if (query.isLoading) return <Skeleton active paragraph={{ rows: 5 }} />;
  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        title={loadError}
        description={errorMessage(query.error)}
        action={
          <Button type="primary" onClick={() => void query.refetch()}>
            {retry}
          </Button>
        }
      />
    );
  }
  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  if (items.length === 0) {
    return <EmptyState variant="empty" title={emptyTitle} description={emptyBody} />;
  }
  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>{render(item)}</li>
        ))}
      </ul>
      {meta && meta.total > meta.limit ? (
        <div className={styles.pager}>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            showSizeChanger={false}
            onChange={onPage}
          />
        </div>
      ) : null}
    </>
  );
}
