'use client';

import { App, Button, Popconfirm, Skeleton } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS_META,
  BOOKING_STATUS_VALUES,
  PERMISSION,
  type BookingStatus,
} from '@xeprime/types';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { useRegisterPageTitle } from '@/components/layout/page-title-context';
import { ROUTES } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isNotFoundError } from '@/lib/http-status';
import { nowInAppTz } from '@/lib/datetime';
import {
  useArchiveInternalDriver,
  useInternalDriverDetail,
  useInternalDriverTrips,
  useRestoreInternalDriver,
} from '../hooks/use-internal-drivers';
import type { DriverTripFilters, InternalDriver, InternalDriverTripRow } from '../types';
import {
  DriverNoteCard,
  DriverProfileCard,
  DriverTripsTable,
  DriverTripsToolbar,
  DriverUpcomingTrips,
  type DriverTripTableRow,
} from './DriverDetailParts';
import { DriverMonthNav } from './DriverMonthNav';
import { DRIVER_MONTH_FORMAT, DRIVER_MONTH_PATTERN } from './DriverMonthPicker';
import { InternalDriverModal } from './InternalDriverModal';
import styles from './DriverDetail.module.css';

function parseFilters(params: URLSearchParams): DriverTripFilters {
  const page = Number(params.get('page'));
  const status = params.get('status') ?? '';
  return {
    month: DRIVER_MONTH_PATTERN.test(params.get('month') ?? '')
      ? (params.get('month') as string)
      : undefined,
    q: params.get('q') ?? undefined,
    status: (BOOKING_STATUS_VALUES as readonly string[]).includes(status) ? status : undefined,
    page: page > 1 ? page : undefined,
    limit: Number(params.get('limit')) || undefined,
  };
}

/**
 * Trang chi tiết MỘT tài xế NỘI BỘ (ADR 0108) — cùng khung với trang tài xế liên kết (Figma
 * `24042:71009`), bớt những gì người nội bộ không có: bằng lái, tiền công, độ tin cậy. Cột trái: hồ
 * sơ (ảnh tuỳ chọn, SĐT, Gọi · Zalo), ghi chú, "Ngừng hợp tác" (= lưu trữ) / "Khôi phục". Cột phải:
 * chuyến sắp tới + bảng các đơn trả xe trong tháng (tìm, lọc trạng thái đơn, phân trang ở server).
 */
export function InternalDriverDetailPage() {
  const t = useTranslations('Drivers.detailPage');
  return (
    <Suspense fallback={<Skeleton active aria-label={t('loading')} />}>
      <InternalDriverDetailInner />
    </Suspense>
  );
}

function InternalDriverDetailInner() {
  const t = useTranslations('Drivers');
  const tPage = useTranslations('Drivers.detailPage');
  const tInt = useTranslations('Drivers.internalDetail');
  const tCommon = useTranslations('Common');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const router = useRouter();
  const availableHref = useAvailableHref();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useUrlFilters(parseFilters);
  // Ảnh chụp lúc mở hộp sửa — lượt tải lại nền không được xoá chữ đang gõ.
  const [editing, setEditing] = useState<InternalDriver | null>(null);

  useRegisterPageTitle(tPage('pageTitle'));

  const canView = has(PERMISSION.DRIVER_VIEW);
  const canManage = has(PERMISSION.DRIVER_MANAGE);
  const month = filters.month ?? nowInAppTz().format(DRIVER_MONTH_FORMAT);
  const detail = useInternalDriverDetail(canView ? id : null);
  const trips = useInternalDriverTrips(canView ? id : null, { ...filters, month });
  const archive = useArchiveInternalDriver();
  const restore = useRestoreInternalDriver();

  if (!canView) {
    return <PermissionState kind="forbidden" missingPermissions={[PERMISSION.DRIVER_VIEW]} />;
  }

  const data = detail.data && detail.data.driver.id === id ? detail.data : undefined;
  if (!data) {
    if (detail.isError) {
      const notFound = isNotFoundError(detail.error);
      const listHref = availableHref(ROUTES.MANAGE.DRIVERS);
      return (
        <div className={styles.state}>
          <EmptyState
            variant="error"
            title={notFound ? tPage('notFound') : tPage('loadError')}
            onRetry={notFound ? undefined : () => void detail.refetch()}
            action={
              notFound && listHref ? (
                <Button onClick={() => router.push(listHref)}>{tPage('backToList')}</Button>
              ) : undefined
            }
          />
        </div>
      );
    }
    return <Skeleton active avatar paragraph={{ rows: 8 }} aria-label={tPage('loading')} />;
  }

  const driver = data.driver;
  const archived = driver.archivedAt !== null;
  const filtered = Boolean(filters.q || filters.status);
  const feedback = (key: 'internal.toast.archived' | 'internal.toast.restored') => ({
    onSuccess: () => message.success(t(key)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });

  const toRow = (row: InternalDriverTripRow): DriverTripTableRow => ({
    key: row.bookingId,
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    vehicleName: row.vehicleName,
    vehiclePlate: row.vehiclePlate,
    vehicleImageUrl: row.vehicleImageUrl,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    pickupAt: row.pickupAt,
    returnAt: row.returnAt,
    status: (
      <StatusBadge
        value={row.bookingStatus as BookingStatus}
        meta={BOOKING_STATUS_META}
        group="bookingStatus"
      />
    ),
  });
  const page = trips.data ? { items: trips.data.items.map(toRow), meta: trips.data.meta } : undefined;

  return (
    <div className={styles.layout}>
      <aside className={styles.aside}>
        <DriverProfileCard
          name={driver.name}
          phone={driver.phone}
          photoUrl={driver.photoUrl}
          onEdit={!archived && canManage ? () => setEditing(driver) : undefined}
          chips={
            <>
              <span className={styles.typeChip}>{t('roster.typeInternal')}</span>
              <span className={archived ? styles.muted : styles.activeChip}>
                {archived ? t('roster.internalArchived') : t('roster.internalActive')}
              </span>
            </>
          }
          facts={[
            {
              key: 'trips',
              label: tPage('profile.activeTrips'),
              value: fmt.count(driver.activeTripCount),
            },
            { key: 'added', label: tPage('profile.addedAt'), value: fmt.date(driver.createdAt) },
            ...(driver.archivedAt
              ? [
                  {
                    key: 'archived',
                    label: tPage('profile.archivedAt'),
                    value: fmt.date(driver.archivedAt),
                  },
                ]
              : []),
          ]}
        />

        <DriverNoteCard
          note={driver.note}
          onEdit={!archived && canManage ? () => setEditing(driver) : undefined}
        />
        <p className={styles.smallNote}>{tInt('noWageNote')}</p>

        {canManage ? (
          <div className={styles.asideFooter}>
            {archived ? (
              <Button
                loading={restore.isPending}
                onClick={() => restore.mutate(driver.id, feedback('internal.toast.restored'))}
              >
                {tInt('restore')}
              </Button>
            ) : (
              <Popconfirm
                title={t('internal.actions.archiveConfirm', { name: driver.name })}
                description={
                  driver.activeTripCount > 0
                    ? t('internal.actions.archiveHasTrips', { count: driver.activeTripCount })
                    : undefined
                }
                okText={tInt('archive')}
                okButtonProps={{ danger: true }}
                cancelText={tCommon('actions.close')}
                onConfirm={() => archive.mutate(driver.id, feedback('internal.toast.archived'))}
              >
                <Button type="text" danger className={styles.textAction} loading={archive.isPending}>
                  {tInt('archive')}
                </Button>
              </Popconfirm>
            )}
          </div>
        ) : null}
      </aside>

      <main className={styles.main}>
        <DriverUpcomingTrips
          trips={data.current}
          total={driver.activeTripCount}
          showWage={false}
        />

        <section className={styles.card} aria-label={tInt('tripsTitle')}>
          <div className={styles.topBar}>
            <div>
              <h3 className={styles.cardTitle}>{tInt('tripsTitle')}</h3>
              <span className={styles.cardHint}>{tInt('tripsHint')}</span>
            </div>
            <DriverMonthNav
              month={month}
              onChange={(next) => setFilters({ month: next, page: undefined }, { resetPage: false })}
            />
          </div>
          <DriverTripsToolbar
            q={filters.q}
            status={filters.status}
            statusOptions={BOOKING_STATUS_VALUES.map((value) => ({
              value,
              label: domainLabel('bookingStatus', value),
            }))}
            onSearch={(q) => setFilters({ q, page: undefined }, { resetPage: false })}
            onStatus={(status) => setFilters({ status, page: undefined }, { resetPage: false })}
          />
          <DriverTripsTable
            label={tInt('tableLabel')}
            page={page}
            loading={trips.isFetching}
            error={
              trips.isError && !trips.data
                ? { title: tInt('loadError'), onRetry: () => void trips.refetch() }
                : null
            }
            empty={
              filtered
                ? {
                    title: tPage('trips.emptyFiltered'),
                    description: tPage('trips.emptyFilteredHint'),
                  }
                : { title: tInt('empty'), description: tInt('emptyHint') }
            }
            onPage={(next, limit) =>
              setFilters({ page: next > 1 ? next : undefined, limit }, { resetPage: false })
            }
            withWage={false}
          />
        </section>
      </main>

      <InternalDriverModal
        open={editing !== null}
        driver={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
