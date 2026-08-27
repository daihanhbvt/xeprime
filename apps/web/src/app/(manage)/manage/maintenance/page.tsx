'use client';

import { App } from 'antd';
import { Suspense, useState } from 'react';
import {
  MAINTENANCE_BOARD_FILTER,
  MAINTENANCE_BOARD_QUEUE_FILTERS,
  MAINTENANCE_TYPE_LABEL,
  MAINTENANCE_TYPE_VALUES,
  PERMISSION,
  type MaintenanceBoardFilter,
  type MaintenanceType,
} from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { MissingReturnKmQueue } from '@/features/handovers/components/MissingReturnKmQueue';
import { useMissingOdometerQueue } from '@/features/handovers/hooks';
import { useInvalidateVehicleSurfaces } from '@/features/vehicles/hooks/use-vehicle-alerts';
import { MAINTENANCE_DEFAULT_LIMIT } from '@/features/vehicle-maintenance/api';
import { MaintenanceBoardTabs } from '@/features/vehicle-maintenance/components/MaintenanceBoardTabs';
import { MaintenanceBoardTable } from '@/features/vehicle-maintenance/components/MaintenanceBoardTable';
import { MaintenanceBoardDialogs } from '@/features/vehicle-maintenance/components/MaintenanceBoardDialogs';
import {
  useMaintenanceBoard,
  useMaintenanceBoardFilters,
  useMaintenanceBoardSummary,
} from '@/features/vehicle-maintenance/hooks';
import type { MaintenanceBoardItem } from '@/features/vehicle-maintenance/types';
import { usePermissions } from '@/hooks/use-permissions';

/** Đưa mọi bộ lọc về mặc định — `'all'`/`undefined` bị `useUrlFilters` xoá khỏi URL. */
const CLEARED = {
  filter: 'all',
  q: undefined,
  type: 'all',
  from: undefined,
  to: undefined,
  sort: 'remaining_asc',
} as const;

const TYPE_OPTIONS = [
  { value: 'all', label: 'Mọi hạng mục' },
  ...MAINTENANCE_TYPE_VALUES.map((value) => ({
    value,
    label: MAINTENANCE_TYPE_LABEL[value as MaintenanceType],
  })),
];

const SORT_OPTIONS = [
  { value: 'remaining_asc', label: 'Gần đến hạn trước' },
  { value: 'remaining_desc', label: 'Còn nhiều KM trước' },
  { value: 'name_asc', label: 'Tên xe A→Z' },
  { value: 'updated_desc', label: 'Cập nhật gần nhất' },
];

const FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm xe', placeholder: 'Tên xe, mã xe hoặc biển số…' },
  { kind: 'select', key: 'type', label: 'Hạng mục', options: TYPE_OPTIONS },
  { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Lịch dự kiến' },
  { kind: 'select', key: 'sort', label: 'Sắp xếp', options: SORT_OPTIONS },
];

/**
 * Hàng đợi "Thiếu KM trả" chỉ có tìm kiếm: hạng mục/lịch dự kiến/sắp xếp theo KM còn lại đều
 * vô nghĩa với một biên bản bàn giao. Hiện ô lọc không tác dụng là mời người dùng bấm nhầm.
 */
const QUEUE_FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm việc', placeholder: 'Tên xe, biển số hoặc mã đơn…' },
];

export default function MaintenancePage() {
  return (
    <Suspense fallback={<LoadingState variant="page" label="Đang tải trung tâm bảo dưỡng…" />}>
      <MaintenanceView />
    </Suspense>
  );
}

/**
 * Trung tâm bảo dưỡng toàn đội xe (Wave 6) — docs/design/12 §9.2.
 *
 * Ưu tiên VIỆC CẦN LÀM: dải tab quá hạn / sắp đến hạn / đang bảo dưỡng / thiếu dữ liệu KM
 * đứng trước bảng. Lọc, sắp xếp và phân trang chạy ở server và sống trên URL (ADR 0004) nên
 * một view lọc chia sẻ được và sống sót qua reload.
 */
function MaintenanceView() {
  const { message } = App.useApp();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const canCorrectOdometer = permissions.has(PERMISSION.VEHICLE_ODOMETER_CORRECT);
  const canViewHandovers = permissions.has(PERMISSION.HANDOVER_VIEW);

  const { filters, setFilters } = useMaintenanceBoardFilters();
  /**
   * Bộ lọc sống trên URL (ADR 0004) nên người dùng gõ tay được `?filter=missing_return_km`.
   * Thiếu `handovers.view` thì chuẩn hoá về nhóm mặc định thay vì mở một bảng rỗng khó hiểu
   * — và dù có lọt qua đây thì guard của `GET /handovers/missing-odometer` vẫn chặn (Wave 8.1).
   */
  const requestedFilter = filters.filter ?? MAINTENANCE_BOARD_FILTER.ALL;
  const isQueueFilter = MAINTENANCE_BOARD_QUEUE_FILTERS.includes(
    requestedFilter as MaintenanceBoardFilter,
  );
  const activeFilter =
    isQueueFilter && !canViewHandovers ? MAINTENANCE_BOARD_FILTER.ALL : requestedFilter;
  // Nhóm việc dạng HÀNG ĐỢI đọc bảng khác — không gọi endpoint đội xe cho nó.
  const isQueue = isQueueFilter && canViewHandovers;
  const board = useMaintenanceBoard(
    // Filter đã chuẩn hoá mới được gửi xuống API — không để giá trị bị từ chối lọt vào query.
    { ...filters, filter: activeFilter },
    canView && !isQueue,
  );
  const summary = useMaintenanceBoardSummary(canView);
  const queue = useMissingOdometerQueue(
    { q: filters.q ?? null, page: filters.page ?? 1, limit: filters.limit ?? MAINTENANCE_DEFAULT_LIMIT },
    canViewHandovers && isQueue,
  );
  const invalidateVehicles = useInvalidateVehicleSurfaces();
  const [dialog, setDialog] = useState<{
    kind: 'schedule' | 'complete' | 'odometer';
    row: MaintenanceBoardItem;
  } | null>(null);

  const items = board.data?.items ?? [];
  const meta = board.data?.meta ?? {
    page: 1,
    limit: MAINTENANCE_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const hasFilters = Boolean(
    (filters.filter && filters.filter !== 'all') ||
      filters.q ||
      (filters.type && filters.type !== 'all') ||
      filters.from ||
      filters.to,
  );

  return (
    <>
      <ManagePageHeader
        title="Trung tâm quản lý bảo dưỡng"
        subtitle="Theo dõi tình trạng hoạt động, lịch trình bảo dưỡng & sửa chữa định kỳ toàn bộ đội xe của bạn."
      />

      {canView ? (
        <MaintenanceBoardTabs
          active={activeFilter}
          summary={summary.data}
          loading={summary.isLoading}
          canViewHandovers={canViewHandovers}
          onChange={(filter) => setFilters({ filter })}
        />
      ) : null}

      <FilterBar
        fields={isQueue ? QUEUE_FILTER_FIELDS : FILTER_FIELDS}
        values={
          isQueue
            ? { q: filters.q }
            : {
                q: filters.q,
                type: filters.type,
                from: filters.from,
                to: filters.to,
                sort: filters.sort,
              }
        }
        onChange={(patch) => setFilters(patch as Partial<typeof filters>)}
        onClear={hasFilters ? () => setFilters(CLEARED) : undefined}
        showActiveChips
        compactFields
      />

      {/*
       * Nhóm việc "Thiếu KM trả" có DÒNG LÀ BIÊN BẢN, không phải xe — nên đổi hẳn bảng thay vì
       * nhồi dữ liệu bàn giao vào bảng đội xe. Vẫn cùng trang, cùng dải tab, cùng bộ lọc tìm kiếm.
       */}
      {isQueue ? (
        <MissingReturnKmQueue
          items={queue.data?.items ?? []}
          meta={queue.data?.meta ?? { page: 1, limit: MAINTENANCE_DEFAULT_LIMIT, total: 0, hasNext: false }}
          loading={queue.isFetching && !queue.data}
          error={queue.isError && !queue.data ? { onRetry: () => void queue.refetch() } : null}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
          onResolved={() => {
            void queue.refetch();
            void summary.refetch();
            invalidateVehicles();
          }}
        />
      ) : (
      <MaintenanceBoardTable
        items={items}
        meta={meta}
        loading={board.isFetching && items.length === 0}
        // Chỉ thay bảng bằng màn lỗi khi KHÔNG còn dữ liệu cũ để đọc.
        error={board.isError && !board.data ? { onRetry: () => void board.refetch() } : null}
        filtered={hasFilters}
        permissionDenied={!canView}
        canManage={canManage}
        canCorrectOdometer={canCorrectOdometer}
        actions={{
          onSchedule: (row) => setDialog({ kind: 'schedule', row }),
          onComplete: (row) => setDialog({ kind: 'complete', row }),
          onCancel: (row) => setDialog({ kind: 'schedule', row }),
          onCorrectOdometer: (row) => setDialog({ kind: 'odometer', row }),
        }}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        onClearFilters={() => setFilters(CLEARED)}
      />
      )}

      <MaintenanceBoardDialogs
        state={dialog}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          void board.refetch();
          void summary.refetch();
          message.success('Đã cập nhật bảo dưỡng');
        }}
      />
    </>
  );
}
