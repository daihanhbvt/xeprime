'use client';

import { Select, Space } from 'antd';
import { useTranslations } from 'next-intl';
import { PLATFORM_TRIP_REQUEST_QUEUES } from '@xeprime/types';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { ALL_FILTER } from '@/constants/filters';
import { TRIPS_DEFAULT_LIMIT } from '@/features/admin-trips/api';
import { RequestQueueTable } from '@/features/admin-trips/components/RequestQueuePanel';
import { useTripRequests } from '@/features/admin-trips/hooks/use-admin-trips';
import type { TripRequestFilters } from '@/features/admin-trips/types';
import { usePendingRequestFilters } from '../hooks/use-pending-request-filters';
import styles from './PendingRequestsView.module.css';

const CLEARED: Partial<TripRequestFilters> = { q: undefined, phone: undefined, queue: undefined };

/**
 * Tab "Chưa giữ chỗ" của Đơn thuê toàn hệ thống — yêu cầu khách đã gửi nhưng CHƯA thành đơn
 * (ADR 0044): đang chờ chủ xe duyệt, hoặc chủ xe đã nhận và đang chờ khách chuyển tiền giữ chỗ.
 * Hạn gần nhất lên đầu. Hết hạn thì yêu cầu tự đóng và sang tab "Không thành" để gọi lại khách.
 *
 * Chỉ ĐỌC (ADR 0006: lịch chỉ có đường ghi của gian hàng); việc duy nhất ở đây là nhắc tay chủ
 * xe — cùng nút, cùng cooldown với Vận hành chuyến.
 */
export function PendingRequestsView() {
  const t = useTranslations('AdminBookings');
  const tQueues = useTranslations('AdminTrips.queues');
  const { filters, setFilters } = usePendingRequestFilters();
  const { data, isError, isFetching, refetch } = useTripRequests(filters);
  const filtered = Boolean(filters.q || filters.phone || filters.queue);

  return (
    <div>
      <p className={styles.intro}>{t('pending.intro')}</p>
      <Space wrap className={styles.filters}>
        <AutoSearchInput
          className={styles.search}
          size="large"
          placeholder={t('pending.searchPlaceholder')}
          aria-label={t('pending.searchLabel')}
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
          className={styles.select}
          size="large"
          aria-label={t('pending.stageLabel')}
          value={filters.queue ?? ALL_FILTER}
          options={[
            { value: ALL_FILTER, label: t('pending.allStages') },
            ...PLATFORM_TRIP_REQUEST_QUEUES.map((value) => ({ value, label: tQueues(value) })),
          ]}
          onChange={(value: string) =>
            setFilters({ queue: value === ALL_FILTER ? undefined : (value as typeof filters.queue) })
          }
        />
      </Space>

      <RequestQueueTable
        queue={filters.queue}
        items={data?.items ?? []}
        meta={data?.meta ?? { page: 1, limit: TRIPS_DEFAULT_LIMIT, total: 0, hasNext: false }}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={filtered}
        onClearFilters={() => setFilters(CLEARED)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
