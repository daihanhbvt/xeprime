'use client';

import { App, Badge, Button, Pagination, Popconfirm, Segmented, Skeleton } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  DRIVER_TRIP_TAB,
  DRIVER_TRIP_TAB_VALUES,
  isDriverTripAwaitingAnswer,
  type DriverTripTab,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { drivingTripPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { DrivingTripTags } from './DrivingTripTags';
import {
  useAcceptDriverTrip,
  useDeclineDriverTrip,
  useDriverPendingCounts,
  useDriverTrips,
} from '../hooks';
import type { DriverTrip } from '../types';
import styles from './Driving.module.css';

/** Tham số URL của tab con — `tab` đã thuộc về bộ chuyển "thuê / lái" của `TripsView`. */
const WHEN_PARAM = 'when';

function isDriverTripTabValue(value: string | null | undefined): value is DriverTripTab {
  return (DRIVER_TRIP_TAB_VALUES as readonly string[]).includes(value ?? '');
}

/**
 * "Chuyến tôi lái" — một tab của "Chuyến của tôi" (ADR 0063). Tab con (sắp tới / đã qua) và trang
 * sống trên URL; chuyến đang chờ tôi nhận nổi bật bằng vạch cảnh báo và dẫn vào màn chi tiết để
 * nhận / từ chối.
 */
export function DrivingTripsList() {
  const t = useTranslations('Driving.trips');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const errorMessage = useErrorMessage();

  const rawWhen = params?.get(WHEN_PARAM);
  const when: DriverTripTab = isDriverTripTabValue(rawWhen) ? rawWhen : DRIVER_TRIP_TAB.UPCOMING;
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);

  const { data, isLoading, isError, error, refetch } = useDriverTrips(when, page);
  const counts = useDriverPendingCounts();
  const pendingTrips = counts.data?.trips ?? 0;

  function navigate(next: { when?: DriverTripTab; page?: number }) {
    const search = new URLSearchParams(params?.toString() ?? '');
    const nextWhen = next.when ?? when;
    const nextPage = next.page ?? (next.when !== undefined ? 1 : page);
    if (nextWhen === DRIVER_TRIP_TAB.UPCOMING) search.delete(WHEN_PARAM);
    else search.set(WHEN_PARAM, nextWhen);
    if (nextPage <= 1) search.delete('page');
    else search.set('page', String(nextPage));
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  }

  const items = data?.items ?? [];
  const meta = data?.meta;
  const upcoming = when === DRIVER_TRIP_TAB.UPCOMING;

  return (
    <>
      <Segmented<DriverTripTab>
        aria-label={t('whenLabel')}
        value={when}
        onChange={(value) => navigate({ when: value })}
        options={[
          {
            value: DRIVER_TRIP_TAB.UPCOMING,
            label: (
              <span>
                {t('upcoming')}{' '}
                {pendingTrips > 0 ? (
                  <Badge
                    count={pendingTrips}
                    size="small"
                    title={t('pendingBadge', { count: pendingTrips })}
                  />
                ) : null}
              </span>
            ),
          },
          { value: DRIVER_TRIP_TAB.PAST, label: t('past') },
        ]}
      />

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : isError ? (
        <EmptyState
          variant="error"
          title={t('loadError')}
          description={errorMessage(error)}
          action={
            <Button type="primary" onClick={() => void refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="empty"
          title={upcoming ? t('emptyUpcomingTitle') : t('emptyPastTitle')}
          description={upcoming ? t('emptyUpcomingBody') : undefined}
        />
      ) : (
        <ul className={styles.list}>
          {items.map((trip) => (
            <li key={trip.id}>
              <DrivingTripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}

      {meta && meta.total > meta.limit ? (
        <div className={styles.pager}>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            showSizeChanger={false}
            showTotal={(total) => t('total', { count: total })}
            onChange={(next) => navigate({ page: next })}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * Thẻ chuyến — phần thông tin dẫn vào chi tiết; chuyến đang chờ thì Nhận / Từ chối ngay trên thẻ
 * (nút nằm NGOÀI link để một cú bấm không vừa mở chi tiết vừa gửi lệnh).
 */
function DrivingTripCard({ trip }: { trip: DriverTrip }) {
  const t = useTranslations('Driving.trips');
  const tDetail = useTranslations('Driving.detail');
  const tToast = useTranslations('Driving.toast');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const accept = useAcceptDriverTrip();
  const decline = useDeclineDriverTrip();
  const busy = accept.isPending || decline.isPending;
  const pending = isDriverTripAwaitingAnswer(trip);
  const onError = (err: unknown) => message.error(errorMessage(err));

  return (
    <article className={`${styles.card} ${pending ? styles.cardPending : ''}`}>
      <Link href={drivingTripPath.detail(trip.id)} className={styles.cardLink}>
        <div className={styles.cardHead}>
          <div>
            <p className={styles.title}>
              {trip.vehicle.name}
              {trip.vehicle.plateNumber ? ` · ${trip.vehicle.plateNumber}` : ''}
            </p>
            <p className={styles.meta}>
              {trip.code} · {fmt.dateTimeRange(trip.pickupAt, trip.returnAt)}
            </p>
          </div>
          <DrivingTripTags trip={trip} />
        </div>
        <p className={styles.meta}>{t('for', { name: trip.employer.name })}</p>
        <p className={styles.meta}>
          {trip.customer.phone
            ? t('customerWithPhone', { name: trip.customer.name, phone: trip.customer.phone })
            : t('customer', { name: trip.customer.name })}
        </p>
        {trip.pickupAddress ? (
          <p className={styles.meta}>{t('pickup', { address: trip.pickupAddress })}</p>
        ) : null}
        {trip.destination ? (
          <p className={styles.meta}>{t('destination', { destination: trip.destination })}</p>
        ) : null}
        {pending ? <p className={styles.warn}>{t('needsAnswer')}</p> : null}
      </Link>
      {pending ? (
        <div className={styles.cardActions}>
          <Button
            type="primary"
            loading={accept.isPending}
            disabled={busy}
            onClick={() =>
              accept.mutate(trip.id, {
                onSuccess: () => message.success(tToast('tripAccepted')),
                onError,
              })
            }
          >
            {tDetail('accept')}
          </Button>
          <Popconfirm
            title={tDetail('declineConfirm')}
            okText={tDetail('decline')}
            cancelText={tCommon('actions.close')}
            onConfirm={() =>
              decline.mutate(trip.id, {
                onSuccess: () => message.success(tToast('tripDeclined')),
                onError,
              })
            }
          >
            <Button danger loading={decline.isPending} disabled={busy}>
              {tDetail('decline')}
            </Button>
          </Popconfirm>
        </div>
      ) : null}
    </article>
  );
}
