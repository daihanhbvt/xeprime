'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { Button, Segmented } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  BOOKING_REQUEST_STATUS_VALUES,
  BOOKING_STATUS_SELECTABLE_VALUES,
  PARTNER_PICKUP_SOON_HOURS,
  SERVICE_TYPE_VALUES,
  type BookingRequestStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import {
  PARTNER_DETAIL_PAGE_SIZE,
  type PartnerBookingFilters,
  type PartnerBookingRequest,
} from './api';
import { usePartnerBookingRequests, usePartnerBookingSummary, usePartnerBookings } from './hooks';
import { PartnerBookingTable, VehicleCell, useTabState } from './parts';
import styles from './PartnerDetail.module.css';

const SEGMENT = { BOOKINGS: 'bookings', REQUESTS: 'requests' } as const;
type Segment = (typeof SEGMENT)[keyof typeof SEGMENT];

/** Khoảng giờ nhận xe — mốc tính MỘT lần lúc chọn, để khoá cache không đổi theo từng lần render. */
const RANGE = { ALL: 'all', PAST_30: 'past_30', NEXT_30: 'next_30' } as const;
type Range = (typeof RANGE)[keyof typeof RANGE];
const DAY_MS = 24 * 60 * 60 * 1000;

function rangeBounds(range: Range): Pick<PartnerBookingFilters, 'dateFrom' | 'dateTo'> {
  const now = Date.now();
  if (range === RANGE.PAST_30) {
    return {
      dateFrom: new Date(now - 30 * DAY_MS).toISOString(),
      dateTo: new Date(now).toISOString(),
    };
  }
  if (range === RANGE.NEXT_30) {
    return {
      dateFrom: new Date(now).toISOString(),
      dateTo: new Date(now + 30 * DAY_MS).toISOString(),
    };
  }
  return {};
}

/**
 * Tab Đơn thuê — tách rõ ĐƠN THUÊ (đã chốt) và YÊU CẦU THUÊ (chưa phải đơn). Chỉ đọc: không có
 * nút duyệt, chuyển trạng thái, thu hay hoàn tiền — những việc đó là của gian hàng, hoặc của nhân
 * sự nền tảng trong phiên hỗ trợ.
 */
export function BookingsTab({ tenantId }: { tenantId: string }) {
  const t = useTranslations('AdminTenants.partnerDetail.bookings');
  const tTab = useTranslations('AdminTenants.partnerDetail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [segment, setSegment] = useState<Segment>(SEGMENT.BOOKINGS);
  const [range, setRange] = useState<Range>(RANGE.ALL);
  const [filters, setFilters] = useState<PartnerBookingFilters>({});
  const [requestFilters, setRequestFilters] = useState<{ status?: string; page?: number }>({});

  const bounds = { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
  const summary = usePartnerBookingSummary(tenantId, bounds, true);
  const bookings = usePartnerBookings(tenantId, filters, segment === SEGMENT.BOOKINGS);
  const requests = usePartnerBookingRequests(
    tenantId,
    requestFilters,
    segment === SEGMENT.REQUESTS,
  );

  const summaryState = useTabState({
    isLoading: summary.isLoading,
    error: summary.isError && !summary.data ? summary.error : null,
    onRetry: () => void summary.refetch(),
    deniedMessage: tTab('denied.bookings'),
  });
  // Mọi hook gọi TRƯỚC lần return sớm dưới đây — thứ tự hook không được đổi theo dữ liệu.
  const bookingsState = useTabStateInline(bookings, tTab('denied.bookings'));
  const requestsState = useTabStateInline(requests, tTab('denied.bookings'));
  if (summaryState) return <div className={styles.tabBody}>{summaryState}</div>;
  const counts = summary.data;

  const all = { value: ALL_FILTER, label: t('filters.all') };
  const bookingFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      allowClear: false,
      options: [
        all,
        ...BOOKING_STATUS_SELECTABLE_VALUES.map((value) => ({
          value,
          label: domainLabel('bookingStatus', value),
        })),
      ],
    },
    {
      kind: 'select',
      key: 'range',
      label: t('filters.range'),
      allowClear: false,
      options: [RANGE.ALL, RANGE.PAST_30, RANGE.NEXT_30].map((value) => ({
        value,
        label: t(`range.${value}`),
      })),
    },
    {
      kind: 'select',
      key: 'serviceType',
      label: t('filters.service'),
      allowClear: false,
      options: [
        all,
        ...SERVICE_TYPE_VALUES.map((value) => ({
          value,
          label: domainLabel('serviceType', value),
        })),
      ],
    },
  ];

  function updateBookings(patch: Record<string, string | undefined>) {
    const next: PartnerBookingFilters = { ...filters, page: undefined };
    if ('q' in patch) next.q = patch.q || undefined;
    if ('status' in patch) next.status = patch.status === ALL_FILTER ? undefined : patch.status;
    if ('serviceType' in patch) {
      next.serviceType = patch.serviceType === ALL_FILTER ? undefined : patch.serviceType;
    }
    if ('range' in patch) {
      const value = (patch.range ?? RANGE.ALL) as Range;
      setRange(value);
      Object.assign(next, { dateFrom: undefined, dateTo: undefined }, rangeBounds(value));
    }
    setFilters(next);
  }

  return (
    <div className={styles.tabBody}>
      <div className={styles.toolbar}>
        <Segmented<Segment>
          value={segment}
          onChange={setSegment}
          options={[
            {
              value: SEGMENT.BOOKINGS,
              icon: <FileTextOutlined />,
              label: t('segments.bookings', { count: counts?.total ?? 0 }),
            },
            {
              value: SEGMENT.REQUESTS,
              icon: <InboxOutlined />,
              label: t('segments.requests', { count: counts?.totalRequests ?? 0 }),
            },
          ]}
        />
        {counts && counts.pendingRequests > 0 ? (
          <Button
            type="link"
            onClick={() => {
              setSegment(SEGMENT.REQUESTS);
              setRequestFilters({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL });
            }}
          >
            {t('pendingRequests', { count: counts.pendingRequests })}
          </Button>
        ) : null}
      </div>

      {segment === SEGMENT.BOOKINGS ? (
        <>
          <FilterBar
            fields={bookingFields}
            values={{
              q: filters.q,
              status: filters.status ?? ALL_FILTER,
              range,
              serviceType: filters.serviceType ?? ALL_FILTER,
            }}
            onChange={updateBookings}
          />
          {counts ? (
            <div className={styles.kpis}>
              <StatCard
                label={t('stats.upcoming')}
                value={fmt.count(counts.upcoming)}
                icon={CarOutlined}
                tone="gold"
              />
              <StatCard
                label={t('stats.active')}
                value={fmt.count(counts.active)}
                icon={CalendarOutlined}
                tone="green"
              />
              <StatCard
                label={t('stats.completed')}
                value={fmt.count(counts.completed)}
                icon={CheckCircleOutlined}
                tone="blue"
              />
              <StatCard
                label={t('stats.cancelled')}
                value={fmt.count(counts.cancelled)}
                icon={CloseCircleOutlined}
                tone="red"
              />
            </div>
          ) : null}
          {counts && counts.pickupSoon > 0 ? (
            <div className={styles.banner} role="status">
              <ExclamationCircleOutlined className={styles.bannerIcon} />
              <span>
                {t('pickupSoon', { count: counts.pickupSoon, hours: PARTNER_PICKUP_SOON_HOURS })}
              </span>
            </div>
          ) : null}
          {bookingsState ?? (
            <PartnerBookingTable
              items={bookings.data?.items ?? []}
              loading={bookings.isFetching}
              filtered={Boolean(
                filters.q || filters.status || filters.serviceType || filters.dateFrom,
              )}
              onClearFilters={() => {
                setRange(RANGE.ALL);
                setFilters({});
              }}
              pagination={{
                page: bookings.data?.meta.page ?? 1,
                total: bookings.data?.meta.total ?? 0,
                pageSize: PARTNER_DETAIL_PAGE_SIZE,
                onChange: (page) => setFilters({ ...filters, page }),
              }}
            />
          )}
        </>
      ) : (
        <>
          <FilterBar
            fields={[
              {
                kind: 'select',
                key: 'status',
                label: t('filters.status'),
                allowClear: false,
                options: [
                  all,
                  ...BOOKING_REQUEST_STATUS_VALUES.filter(
                    (value) => value !== BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
                  ).map((value) => ({ value, label: domainLabel('bookingRequestStatus', value) })),
                ],
              },
            ]}
            values={{ status: requestFilters.status ?? ALL_FILTER }}
            onChange={(patch) =>
              setRequestFilters({ status: patch.status === ALL_FILTER ? undefined : patch.status })
            }
          />
          {requestsState ?? (
            <RequestTable
              items={requests.data?.items ?? []}
              loading={requests.isFetching}
              filtered={Boolean(requestFilters.status)}
              onClearFilters={() => setRequestFilters({})}
              page={requests.data?.meta.page ?? 1}
              total={requests.data?.meta.total ?? 0}
              onPageChange={(page) => setRequestFilters({ ...requestFilters, page })}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Trạng thái tải/lỗi/không quyền cho một query danh sách của tab. */
function useTabStateInline(
  query: {
    isLoading: boolean;
    isError: boolean;
    data: unknown;
    error: unknown;
    refetch: () => unknown;
  },
  deniedMessage: string,
) {
  return useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage,
  });
}

function RequestTable({
  items,
  loading,
  filtered,
  onClearFilters,
  page,
  total,
  onPageChange,
}: {
  items: PartnerBookingRequest[];
  loading: boolean;
  filtered: boolean;
  onClearFilters: () => void;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.bookings');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const columns: DataTableColumn<PartnerBookingRequest>[] = [
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      width: 220,
      render: (_, row) => (
        <VehicleCell
          name={row.vehicleName}
          plate={row.vehiclePlateNumber}
          imageUrl={row.vehicleImageUrl}
        />
      ),
    },
    {
      title: t('columns.customer'),
      key: 'customer',
      width: 170,
      render: (_, row) => (
        <span className={styles.stack}>
          <span>{row.customerNameMasked}</span>
          {row.customerPhoneMasked ? (
            <span className={styles.muted}>{row.customerPhoneMasked}</span>
          ) : null}
        </span>
      ),
    },
    {
      title: t('columns.time'),
      key: 'time',
      width: 190,
      render: (_, row) => (row.pickupAt ? fmt.shortDateTimeRange(row.pickupAt, row.returnAt) : '—'),
    },
    {
      title: t('columns.service'),
      key: 'service',
      width: 110,
      render: (_, row) => domainLabel('serviceType', row.serviceType),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as BookingRequestStatus}
          meta={BOOKING_REQUEST_STATUS_META}
          group="bookingRequestStatus"
        />
      ),
    },
    {
      title: t('columns.respondBy'),
      key: 'respondBy',
      width: 140,
      render: (_, row) => fmt.dateTime(row.respondBy),
    },
    {
      title: t('columns.created'),
      key: 'created',
      width: 140,
      render: (_, row) => fmt.dateTime(row.createdAt),
    },
  ];
  return (
    <DataTable<PartnerBookingRequest>
      label={t('requestsTableLabel')}
      columns={columns}
      items={items}
      minWidth={1100}
      loading={loading}
      filtered={filtered}
      empty={{ title: t('requestsEmpty') }}
      noResults={{
        title: t('requestsNoResults'),
        action: (
          <Button type="link" onClick={onClearFilters}>
            {t('clearFilters')}
          </Button>
        ),
      }}
      pagination={{
        meta: {
          page,
          limit: PARTNER_DETAIL_PAGE_SIZE,
          total,
          hasNext: page * PARTNER_DETAIL_PAGE_SIZE < total,
        },
        onChange: (next) => onPageChange(next),
        totalLabel: (count) => t('requestsTotal', { count }),
      }}
    />
  );
}
