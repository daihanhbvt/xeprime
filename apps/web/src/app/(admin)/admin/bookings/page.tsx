'use client';

import { DatePicker, Select, Space } from 'antd';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { BOOKING_DATE_FIELD } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { CountTabs } from '@/components/navigation/CountTabs';
import { FollowUpsView } from '@/features/admin-follow-ups/components/FollowUpsView';
import {
  ADMIN_BOOKINGS_VIEW,
  ADMIN_BOOKINGS_VIEW_HREF,
  ADMIN_BOOKINGS_VIEW_PARAM,
  parseAdminBookingsView,
  type AdminBookingsView,
} from '@/features/admin-follow-ups/constants';
import { useNewFollowUpCount } from '@/features/admin-follow-ups/hooks/use-follow-ups';
import { useTripSummary } from '@/features/admin-trips/hooks/use-admin-trips';
import { ADMIN_BOOKINGS_DEFAULT_LIMIT } from '@/features/admin-bookings/api';
import { AdminBookingDetailDrawer } from '@/features/admin-bookings/components/AdminBookingDetailDrawer';
import { AdminBookingTable } from '@/features/admin-bookings/components/AdminBookingTable';
import { PendingRequestsView } from '@/features/admin-bookings/components/PendingRequestsView';
import { useAdminBookingFilters } from '@/features/admin-bookings/hooks/use-admin-booking-filters';
import { useAdminBookingOptions } from '@/features/admin-bookings/hooks/use-admin-booking-options';
import { useAdminBookings } from '@/features/admin-bookings/hooks/use-admin-bookings';
import type { AdminBookingFilters } from '@/features/admin-bookings/types';
import { ALL_FILTER } from '@/constants/filters';
import { useDatePickerPattern } from '@/i18n/use-app-format';
import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';
import styles from './bookings-page.module.css';

const CLEARED: Partial<AdminBookingFilters> = {
  q: undefined,
  phone: undefined,
  tenantId: undefined,
  vehicleId: undefined,
  status: ALL_FILTER,
  dateFrom: undefined,
  dateTo: undefined,
};

function PageFallback() {
  const t = useTranslations('AdminBookings.page');
  return <LoadingState variant="page" label={t('loading')} />;
}

/** Đổi góc nhìn thì bỏ bộ lọc của góc kia — hai danh sách có bộ lọc khác nhau. */
const VIEW = ADMIN_BOOKINGS_VIEW;
type View = AdminBookingsView;

export default function AdminBookingsPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AdminBookingsTabs />
    </Suspense>
  );
}

function AdminBookingsTabs() {
  const t = useTranslations('AdminFollowUps.tabs');
  const tPage = useTranslations('AdminBookings.page');
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: View = parseAdminBookingsView(searchParams.get(ADMIN_BOOKINGS_VIEW_PARAM));
  const newCount = useNewFollowUpCount();
  // Số trên tab "Chưa giữ chỗ" = hai hàng đợi trước khi có đơn của Vận hành chuyến — cùng nguồn
  // đếm, nên con số ở hai màn luôn khớp nhau.
  const summary = useTripSummary();
  const pendingCount = summary.data
    ? summary.data.queues.pending_approval.count + summary.data.queues.awaiting_hold.count
    : undefined;

  const tabs = (
    <CountTabs<View>
      label={t('label')}
      value={view}
      items={[
        { value: VIEW.PENDING, label: t('pending'), count: pendingCount },
        { value: VIEW.BOOKINGS, label: t('bookings') },
        { value: VIEW.FOLLOW_UPS, label: t('followUps'), count: newCount.data },
      ]}
      onChange={(next) => router.replace(ADMIN_BOOKINGS_VIEW_HREF[next])}
    />
  );

  if (view === VIEW.BOOKINGS) return <AdminBookingsView tabs={tabs} />;
  return (
    <div>
      <ManagePageHeader title={tPage('title')} />
      {tabs}
      {view === VIEW.PENDING ? <PendingRequestsView /> : <FollowUpsView />}
    </div>
  );
}

function AdminBookingsView({ tabs }: { tabs: ReactNode }) {
  const t = useTranslations('AdminBookings');
  const options = useAdminBookingOptions();
  const datePattern = useDatePickerPattern();
  const { filters, setFilters } = useAdminBookingFilters();
  const { data, isError, refetch, isFetching } = useAdminBookings(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_BOOKINGS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const hasFilters = Boolean(
    filters.q ||
    filters.phone ||
    filters.tenantId ||
    filters.vehicleId ||
    (filters.status && filters.status !== ALL_FILTER) ||
    filters.dateFrom ||
    filters.dateTo,
  );

  const range: [Dayjs | null, Dayjs | null] = [
    filters.dateFrom ? dayjs(filters.dateFrom, DAY_PARAM_FORMAT) : null,
    filters.dateTo ? dayjs(filters.dateTo, DAY_PARAM_FORMAT) : null,
  ];

  return (
    // Panel chi tiết là drawer chuẩn (có mask, bấm ra ngoài là đóng) — trang không chừa chỗ, không
    // co cột; hàng vừa mở được tô để đóng panel rồi vẫn biết mình đang ở dòng nào.
    <div>
      <ManagePageHeader
        title={t('page.title')}
        extra={
          <Space wrap>
            <AutoSearchInput
              className={styles.search}
              size="large"
              placeholder={t('filters.searchPlaceholder')}
              aria-label={t('filters.searchLabel')}
              value={filters.q}
              onSearch={(value) => setFilters({ q: value || undefined })}
            />
            <AutoSearchInput
              className={styles.phone}
              size="large"
              placeholder={t('filters.phonePlaceholder')}
              aria-label={t('filters.phoneLabel')}
              value={filters.phone}
              onSearch={(value) => setFilters({ phone: value || undefined })}
            />
            <Select
              className={styles.statusSelect}
              size="large"
              aria-label={t('filters.statusLabel')}
              value={filters.status ?? ALL_FILTER}
              options={options.status}
              onChange={(value: string) => setFilters({ status: value })}
            />
            <Select
              className={styles.dateFieldSelect}
              size="large"
              aria-label={t('filters.dateFieldLabel')}
              value={filters.dateField ?? BOOKING_DATE_FIELD.CREATED_AT}
              options={options.dateField}
              onChange={(value: string) => setFilters({ dateField: value })}
            />
            <DatePicker.RangePicker
              className={styles.rangePicker}
              size="large"
              aria-label={t('filters.dateRangeLabel')}
              allowEmpty={[true, true]}
              value={range}
              format={datePattern.date}
              onChange={(dates) =>
                setFilters({
                  dateFrom: dates?.[0] ? dates[0].format(DAY_PARAM_FORMAT) : undefined,
                  dateTo: dates?.[1] ? dates[1].format(DAY_PARAM_FORMAT) : undefined,
                })
              }
            />
          </Space>
        }
      />

      {tabs}

      <AdminBookingTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => setSelected(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        selectedId={selected}
      />

      <AdminBookingDetailDrawer bookingId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
