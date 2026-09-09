'use client';

import { ThunderboltOutlined } from '@ant-design/icons';
import { Avatar, Button, Pagination, Segmented } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import {
  BOOKING_REQUEST_DECISION_SOURCE,
  CUSTOMER_TRIP_STAGE_META,
  PERMISSION,
  VEHICLE_TRIP_HISTORY_FILTER,
  VEHICLE_TRIP_HISTORY_FILTER_VALUES,
  VEHICLE_TRIP_HISTORY_KIND,
  type CustomerTripStage,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { tripPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { initialOf } from '@/lib/initials';

import { TRIP_HISTORY_DEFAULT_LIMIT } from '../../api';
import { useVehicleTripHistory, useVehicleTripHistoryFilters } from '../../hooks';
import type { VehicleTripHistoryItem } from '../../types';
import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './TripHistorySection.module.css';

/** Bọc Suspense vì bộ lọc đọc `useSearchParams`. */
export function TripHistorySection() {
  return (
    <Suspense fallback={<LoadingState variant="cards" />}>
      <TripHistoryContent />
    </Suspense>
  );
}

/**
 * Lịch sử chuyến của MỘT xe (mockup 5): đơn thật + yêu cầu chưa/không thành đơn, trộn và phân
 * trang ở SERVER (`GET /vehicles/:id/trip-history`). Tab và trang sống ở URL (ADR 0004).
 *
 * Cần CẢ hai quyền xem đơn và xem yêu cầu — thiếu một là không gọi API (backend cũng đòi cả hai).
 */
function TripHistoryContent() {
  const { vehicle } = useManagedVehicle();
  const t = useTranslations('VehicleManage.tripHistory');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const { filters, setFilters } = useVehicleTripHistoryFilters();
  const canView = has(PERMISSION.BOOKING_VIEW) && has(PERMISSION.BOOKING_REQUEST_VIEW);
  const query = useVehicleTripHistory(canView ? vehicle.id : undefined, filters);

  const filter = filters.filter ?? VEHICLE_TRIP_HISTORY_FILTER.ALL;
  const tabs = (
    <Segmented
      aria-label={t('tabsLabel')}
      value={filter}
      options={VEHICLE_TRIP_HISTORY_FILTER_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleTripHistoryFilter', value),
      }))}
      onChange={(value) => setFilters({ filter: String(value) })}
    />
  );

  if (!canView) {
    return (
      <SectionCard title={t('title')} headingLevel={1}>
        <PermissionState
          kind="forbidden"
          description={t('forbidden')}
          missingPermissions={[PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW]}
        />
      </SectionCard>
    );
  }

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  return (
    <SectionCard title={t('title')} extra={tabs} headingLevel={1}>
      {query.isLoading ? (
        <LoadingState variant="cards" rows={4} />
      ) : query.isError && !query.data ? (
        <EmptyState
          variant="error"
          title={t('loadError')}
          description={tCommon('states.errorHint')}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant={filter === VEHICLE_TRIP_HISTORY_FILTER.ALL ? 'empty' : 'no-results'}
          title={filter === VEHICLE_TRIP_HISTORY_FILTER.ALL ? t('empty') : t('emptyFiltered')}
          action={
            filter !== VEHICLE_TRIP_HISTORY_FILTER.ALL ? (
              <Button onClick={() => setFilters({ filter: undefined })}>
                {tCommon('actions.clear')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className={styles.list} aria-busy={query.isFetching}>
          {items.map((item) => (
            <li key={item.key}>
              <TripHistoryCard item={item} />
            </li>
          ))}
        </ul>
      )}
      {meta && meta.total > meta.limit ? (
        <Pagination
          className={styles.pagination}
          current={meta.page}
          pageSize={meta.limit}
          total={meta.total}
          showSizeChanger={false}
          onChange={(page) => setFilters({ page, limit: meta.limit ?? TRIP_HISTORY_DEFAULT_LIMIT })}
        />
      ) : null}
    </SectionCard>
  );
}

/**
 * Một dòng lịch sử. Tiền chỉ hiện khi có SỐ CHỐT — yêu cầu chưa thành đơn nói "chưa có số chốt",
 * không bao giờ là `0đ`. Mở chi tiết qua `/trips/[id]` — route nhận cả id đơn lẫn id yêu cầu và
 * là màn chi tiết chuyến duy nhất của chủ xe ở khu tài khoản.
 */
function TripHistoryCard({ item }: { item: VehicleTripHistoryItem }) {
  const t = useTranslations('VehicleManage.tripHistory');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const isBooking = item.kind === VEHICLE_TRIP_HISTORY_KIND.BOOKING;
  const targetId = item.bookingId ?? item.requestId ?? '';

  return (
    <article className={styles.card}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('start')}</dt>
          <dd>{item.pickupAt ? fmt.shortDateTime(item.pickupAt) : fmt.packageLabel(item.longTermPackageMonths) ?? '—'}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('end')}</dt>
          <dd>{item.returnAt ? fmt.shortDateTime(item.returnAt) : '—'}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('total')}</dt>
          <dd className={item.totalAmount ? styles.money : styles.muted}>
            {item.totalAmount ? fmt.money(item.totalAmount) : t('awaitingQuote')}
          </dd>
        </div>
      </dl>
      <div className={styles.customer}>
        <Avatar size={40} src={item.customerAvatarUrl ?? undefined}>
          {initialOf(item.customerName)}
        </Avatar>
        <span className={styles.customerName}>{item.customerName || t('renterUnknown')}</span>
      </div>
      <footer className={styles.foot}>
        <span className={styles.status}>
          <StatusTag
            value={item.stage as CustomerTripStage}
            meta={CUSTOMER_TRIP_STAGE_META}
            group="customerTripStage"
          />
          {item.decisionSource === BOOKING_REQUEST_DECISION_SOURCE.SYSTEM ? (
            <span className={styles.auto}>
              <ThunderboltOutlined aria-hidden="true" /> {t('autoAccepted')}
            </span>
          ) : null}
          <span className={styles.kind}>{domainLabel('vehicleTripHistoryKind', item.kind)}</span>
        </span>
        <span className={styles.time}>{fmt.shortDateTime(item.happenedAt)}</span>
        {targetId ? (
          <Link href={tripPath.detail(targetId)} className={styles.open}>
            {isBooking ? t('openBooking') : t('openRequest')}
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
