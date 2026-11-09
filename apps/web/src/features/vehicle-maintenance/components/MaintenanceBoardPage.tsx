'use client';

import { App, Select } from 'antd';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  MAINTENANCE_BOARD_FILTER,
  MAINTENANCE_BOARD_QUEUE_FILTERS,
  MAINTENANCE_BOARD_SORT,
  MAINTENANCE_BOARD_SORT_VALUES,
  MAINTENANCE_TYPE_VALUES,
  PERMISSION,
  type MaintenanceBoardFilter,
  type MaintenanceBoardSort,
} from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { MissingReturnKmQueue } from '@/features/handovers/components/MissingReturnKmQueue';
import { useMissingOdometerQueue } from '@/features/handovers/hooks';
import { useInvalidateVehicleSurfaces } from '@/features/vehicles/hooks/use-vehicle-alerts';
import { MAINTENANCE_DEFAULT_LIMIT } from '@/features/vehicle-maintenance/api';
import { MaintenanceBoardTabs } from '@/features/vehicle-maintenance/components/MaintenanceBoardTabs';
import { MaintenanceBoardList } from '@/features/vehicle-maintenance/components/MaintenanceBoardList';
import { MaintenanceBoardDialogs } from '@/features/vehicle-maintenance/components/MaintenanceBoardDialogs';
import {
  useInvalidateMaintenanceFor,
  useMaintenanceBoard,
  useMaintenanceBoardFilters,
  useMaintenanceBoardSummary,
} from '@/features/vehicle-maintenance/hooks';
import type { MaintenanceBoardItem } from '@/features/vehicle-maintenance/types';
import { usePermissions } from '@/hooks/use-permissions';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import { cancelMaintenanceRecord } from '@/features/vehicle-maintenance/api';
import styles from './MaintenanceBoardPage.module.css';

/**
 * Đưa mọi bộ lọc về mặc định — `'all'`/`undefined` bị `useUrlFilters` xoá khỏi URL. Sắp xếp
 * KHÔNG nằm ở đây: nó đổi thứ tự chứ không lọc (cùng luật với Danh sách xe).
 */
const CLEARED = {
  filter: 'all',
  q: undefined,
  branchId: undefined,
  type: 'all',
  from: undefined,
  to: undefined,
  resolve: undefined,
} as const;

const SORT_VALUES = MAINTENANCE_BOARD_SORT_VALUES;
type BoardSort = MaintenanceBoardSort;

export function MaintenanceBoardPage() {
  const t = useTranslations('Maintenance');
  return (
    <Suspense fallback={<LoadingState variant="page" label={t('page.loading')} />}>
      <MaintenanceView />
    </Suspense>
  );
}

/**
 * Danh sách bảo dưỡng toàn đội xe — Figma Partner-XePrime `23733:41941` (04/11/2026).
 *
 * Ưu tiên VIỆC CẦN LÀM: dải chip quá hạn / sắp đến hạn / đang bảo dưỡng / thiếu dữ liệu KM
 * đứng ngay dưới hàng lọc, trên danh sách (giữ theo chốt 04/11 — design không vẽ). Lọc, sắp
 * xếp và phân trang chạy ở server và sống trên URL (ADR 0004) nên một view lọc chia sẻ được và
 * sống sót qua reload.
 */
function MaintenanceView() {
  const t = useTranslations('Maintenance');
  const domainLabel = useDomainLabel();
  const tCommon = useTranslations('Common');
  const { message, modal } = App.useApp();
  const errorMessage = useErrorMessage();
  const invalidateMaintenance = useInvalidateMaintenanceFor();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  /*
   * Phiên hỗ trợ gian hàng (ADR 0050 §9–10): bảng chỉ để XEM. Lên lịch/dời lịch (chiếm lịch xe) và
   * hoàn tất phiếu (ghi KM, sinh phiếu chi) không mở trong phiên dù chế độ assist có quyền sửa
   * phiếu — việc đó làm ở hồ sơ bảo dưỡng của từng xe, và backend cũng chặn.
   */
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.MAINTENANCE_SCHEDULE);
  const canManage = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE) && !inSupport;
  const canCorrectOdometer = permissions.has(PERMISSION.VEHICLE_ODOMETER_CORRECT);
  const canViewHandovers = permissions.has(PERMISSION.HANDOVER_VIEW);

  const { filters, setFilters } = useMaintenanceBoardFilters();
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });
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
    { ...filters, filter: activeFilter, branchId: filters.branchId },
    canView && !isQueue,
  );
  // Dải đếm trên hàng tab đi theo CÙNG chi nhánh với bảng — tab nói "12 quá hạn" trong khi bảng
  // hiện 2 dòng là hai câu trả lời cho cùng một câu hỏi.
  const summary = useMaintenanceBoardSummary(canView, filters.branchId);
  const queue = useMissingOdometerQueue(
    {
      q: filters.q ?? null,
      // Tab "Thiếu KM trả" đọc bảng khác nhưng vẫn là MỘT tab của màn này: bỏ chi nhánh ở đây là
      // ba tab lọc còn tab thứ tư âm thầm hiện cả gian hàng.
      branchId: filters.branchId ?? null,
      page: filters.page ?? 1,
      limit: filters.limit ?? MAINTENANCE_DEFAULT_LIMIT,
    },
    canViewHandovers && isQueue,
  );
  const invalidateVehicles = useInvalidateVehicleSurfaces();
  const [dialog, setDialog] = useState<{
    kind: 'schedule' | 'complete' | 'odometer';
    row: MaintenanceBoardItem;
  } | null>(null);

  const typeOptions = [
    { value: 'all', label: t('filters.allTypes') },
    ...MAINTENANCE_TYPE_VALUES.map((value) => ({
      value,
      label: domainLabel('maintenanceType', value),
    })),
  ];

  const sortLabel: Readonly<Record<BoardSort, string>> = {
    [MAINTENANCE_BOARD_SORT.REMAINING_ASC]: t('filters.sortRemainingAsc'),
    [MAINTENANCE_BOARD_SORT.REMAINING_DESC]: t('filters.sortRemainingDesc'),
    [MAINTENANCE_BOARD_SORT.NAME_ASC]: t('filters.sortNameAsc'),
    [MAINTENANCE_BOARD_SORT.UPDATED_DESC]: t('filters.sortUpdatedDesc'),
  };

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    ...(branch.field ? [branch.field] : []),
    { kind: 'select', key: 'type', label: t('filters.type'), options: typeOptions },
    { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: t('filters.schedule') },
  ];

  /*
   * "Sắp xếp: Gần đến hạn" cuối hàng (design) — KHÔNG phải một ô lọc: nó không lọc dữ liệu, nên
   * không vào huy hiệu đếm bộ lọc của mobile và "Xoá bộ lọc" giữ nguyên nó (như Danh sách xe).
   */
  const sortSelect = (
    <Select<BoardSort>
      className={styles.sort}
      size="large"
      aria-label={t('filters.sort')}
      labelRender={(item) => t('filters.sortValue', { label: String(item.label) })}
      value={
        (SORT_VALUES as readonly string[]).includes(filters.sort)
          ? (filters.sort as BoardSort)
          : MAINTENANCE_BOARD_SORT.REMAINING_ASC
      }
      options={SORT_VALUES.map((value) => ({ value, label: sortLabel[value] }))}
      onChange={(sort) => setFilters({ sort })}
    />
  );

  /** "Hủy lịch" — hỏi lại rồi huỷ phiếu đang mở; phiếu ở lại lịch sử với nhãn "Đã hủy" (sổ E22). */
  function confirmCancel(row: MaintenanceBoardItem) {
    const record = row.activeRecord;
    if (!record) return;
    modal.confirm({
      title: t('actions.cancelScheduleConfirm'),
      okText: t('actions.cancelSchedule'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.close'),
      onOk: async () => {
        try {
          await cancelMaintenanceRecord(row.vehicleId, record.id, record.rowVersion);
          message.success(t('toast.canceled'));
        } catch (err) {
          message.error(
            getErrorCode(err) === 'CONFLICT' ? t('toast.staleRecord') : errorMessage(err),
          );
        } finally {
          // Thành công hay xung đột phiên bản: số trên dòng đều đã cũ.
          invalidateMaintenance(row.vehicleId);
        }
      },
    });
  }

  /**
   * Hàng đợi "Thiếu KM trả" chỉ có tìm kiếm VÀ chi nhánh: hạng mục/lịch dự kiến/sắp xếp theo KM
   * còn lại đều vô nghĩa với một biên bản bàn giao. Hiện ô lọc không tác dụng là mời người dùng
   * bấm nhầm — nhưng chi nhánh thì có tác dụng thật ở đây, và giữ nó lại để việc đổi tab không
   * làm người dùng rơi khỏi chi nhánh họ đang xem.
   */
  const queueFilterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.queueSearch'),
      placeholder: t('filters.queueSearchPlaceholder'),
    },
    ...(branch.field ? [branch.field] : []),
  ];

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
      filters.branchId ||
      (filters.type && filters.type !== 'all') ||
      filters.from ||
      filters.to,
  );

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <FilterBar
        fields={isQueue ? queueFilterFields : filterFields}
        values={
          isQueue
            ? { q: filters.q, branchId: filters.branchId ?? ALL_FILTER }
            : {
                q: filters.q,
                branchId: filters.branchId ?? ALL_FILTER,
                type: filters.type,
                from: filters.from,
                to: filters.to,
              }
        }
        onChange={(patch) => {
          setFilters(patch as Partial<typeof filters>);
        }}
        onClear={hasFilters ? () => setFilters(CLEARED) : undefined}
        showActiveChips
        // Hàng đợi "Thiếu KM trả" sắp theo biên bản — ô sắp xếp KM còn lại vô nghĩa ở đó.
        actions={isQueue ? undefined : sortSelect}
      />

      {canView ? (
        <MaintenanceBoardTabs
          active={activeFilter}
          summary={summary.data}
          loading={summary.isLoading}
          canViewHandovers={canViewHandovers}
          // Rời tab thì bỏ luôn biên bản đang chờ mở — quay lại tab không được tự bật hộp cũ.
          onChange={(filter) => setFilters({ filter, resolve: undefined })}
        />
      ) : null}

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
          requestedBookingId={filters.resolve}
          onRequestHandled={() => setFilters({ resolve: undefined }, { resetPage: false })}
          onResolved={() => {
            void queue.refetch();
            void summary.refetch();
            invalidateVehicles();
          }}
        />
      ) : (
        <MaintenanceBoardList
          items={items}
          meta={meta}
          loading={board.isFetching && items.length === 0}
          // Chỉ thay danh sách bằng màn lỗi khi KHÔNG còn dữ liệu cũ để đọc.
          error={board.isError && !board.data ? { onRetry: () => void board.refetch() } : null}
          filtered={hasFilters}
          permissionDenied={!canView}
          canManage={canManage}
          canCorrectOdometer={canCorrectOdometer}
          actions={{
            onSchedule: (row) => setDialog({ kind: 'schedule', row }),
            onComplete: (row) => setDialog({ kind: 'complete', row }),
            onCancel: confirmCancel,
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
          message.success(t('toast.saved'));
        }}
      />
    </div>
  );
}
