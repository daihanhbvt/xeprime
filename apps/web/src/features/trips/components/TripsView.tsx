'use client';

import { Alert, Button, Pagination, Skeleton, Tabs } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_VALUES,
  isCustomerTripFilter,
  type CustomerTripFilter,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';
import { TRIPS_DEFAULT_LIMIT } from '../api';
import { useTrips } from '../hooks';
import type { CustomerTripCounts } from '../types';
import { TripCard } from './TripCard';
import styles from './TripsView.module.css';

/**
 * `Chuyến của tôi` — danh sách duy nhất cho khách.
 *
 * Bộ lọc và trang sống ở **URL searchParams** (ADR 0004): tab đang mở gửi link được, F5 không
 * mất, và nút Back của trình duyệt quay đúng tab trước đó. Không có bản sao state nào ở
 * component.
 *
 * Lọc, phân trang và ĐẾM đều ở server. Đếm ở client chỉ đúng với đúng trang đang tải — tab sẽ
 * nói `Hoàn thành (3)` khi khách có 30 chuyến hoàn thành.
 */
export function TripsView() {
  const t = useTranslations('Trips');
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  const rawFilter = params?.get('filter');
  const filter: CustomerTripFilter = isCustomerTripFilter(rawFilter)
    ? rawFilter
    : CUSTOMER_TRIP_FILTER.ALL;
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);

  const { data, isLoading, isError, error, refetch, isFetching } = useTrips(filter, page);

  function navigate(next: { filter?: CustomerTripFilter; page?: number }) {
    const search = new URLSearchParams(params?.toString() ?? '');
    const nextFilter = next.filter ?? filter;
    // Đổi tab luôn về trang 1: giữ `page=4` khi sang tab chỉ có 1 trang là một trang trống.
    const nextPage = next.page ?? (next.filter ? 1 : page);

    if (nextFilter === CUSTOMER_TRIP_FILTER.ALL) search.delete('filter');
    else search.set('filter', nextFilter);
    if (nextPage <= 1) search.delete('page');
    else search.set('page', String(nextPage));

    const qs = search.toString();
    router.replace(qs ? `${ROUTES.TRIPS}?${qs}` : ROUTES.TRIPS, { scroll: false });
  }

  if (isError) {
    // Hết phiên là chuyện của đăng nhập, không phải lỗi tải dữ liệu — hai thứ cần hai lối thoát
    // khác nhau, và "Thử lại" cho phiên hết hạn chỉ lặp lại đúng lỗi đó.
    if (isUnauthenticated(error)) {
      return (
        <div className={styles.page}>
          <EmptyState
            variant="empty"
            title={t('auth.expiredTitle')}
            description={t('auth.expiredList')}
            action={
              <Button
                type="primary"
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                {t('auth.login')}
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className={styles.page}>
        <EmptyState
          variant="error"
          title={t('list.errorTitle')}
          description={errorMessage(error)}
          action={
            <Button type="primary" onClick={() => void refetch()}>
              {t('list.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const counts = data?.counts;
  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('list.heading')}</h1>
        <p className={styles.sub}>{t('list.sub')}</p>
      </header>

      <Tabs
        activeKey={filter}
        onChange={(key) => navigate({ filter: key as CustomerTripFilter })}
        items={CUSTOMER_TRIP_FILTER_VALUES.map((key) => ({
          key,
          label: counts
            ? t('list.tabLabel', {
                label: dl('customerTripFilter', key),
                count: countOf(counts, key),
              })
            : dl('customerTripFilter', key),
        }))}
      />

      {isLoading ? (
        <div className={styles.list} aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className={styles.skeleton}>
              <Skeleton active avatar={{ shape: 'square', size: 64 }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t('list.emptyTitle')}
          description={
            filter === CUSTOMER_TRIP_FILTER.ALL
              ? t('list.emptyAllBody')
              : t('list.emptyFilteredBody')
          }
          action={
            filter === CUSTOMER_TRIP_FILTER.ALL ? (
              <Button type="primary" onClick={() => router.push(ROUTES.SEARCH)}>
                {t('list.findVehicle')}
              </Button>
            ) : (
              <Button onClick={() => navigate({ filter: CUSTOMER_TRIP_FILTER.ALL })}>
                {t('list.viewAll')}
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* `aria-busy` khi đang nạp trang/tab mới: nội dung cũ còn đó nhưng đã lỗi thời. */}
          <div className={styles.list} aria-busy={isFetching}>
            {items.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>

          {meta && meta.total > TRIPS_DEFAULT_LIMIT ? (
            <div className={styles.pager}>
              <Pagination
                current={meta.page}
                pageSize={meta.limit}
                total={meta.total}
                onChange={(next) => navigate({ page: next })}
                showSizeChanger={false}
              />
            </div>
          ) : null}
        </>
      )}

      {/* Dữ liệu cũ vẫn hiển thị trong lúc nạp lại; chỉ báo nhẹ thay vì chớp sang skeleton. */}
      {!isLoading && isFetching ? (
        <Alert type="info" showIcon message={t('list.refreshing')} className={styles.refreshing} />
      ) : null}
    </div>
  );
}

function countOf(counts: CustomerTripCounts, filter: CustomerTripFilter): number {
  return counts[filter];
}
