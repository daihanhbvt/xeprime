'use client';

import { Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { STOREFRONT_KIND_VALUES, VEHICLE_TYPE_VALUES } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import {
  VEHICLE_APPROVALS_DEFAULT_LIMIT,
  VEHICLE_APPROVALS_DEFAULT_STATUS,
} from '@/features/approvals/api';
import { VehicleApprovalDrawer } from '@/features/approvals/components/VehicleApprovalDrawer';
import { VehicleApprovalTable } from '@/features/approvals/components/VehicleApprovalTable';
import { APPROVAL_STATUS_ANY, APPROVAL_STATUS_FILTER_ORDER } from '@/features/approvals/constants';
import {
  filterBarPatch,
  filterBarValues,
  useVehicleApprovalFilters,
  type VehicleApprovalUrlState,
} from '@/features/approvals/hooks/use-vehicle-approval-filters';
import { useVehicleApprovals } from '@/features/approvals/hooks/use-vehicle-approvals';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './admin-page.module.css';

/** "Xoá bộ lọc" đưa về đúng hàng đợi mặc định: phiếu CHỜ, mọi loại xe, mọi nguồn. */
const CLEARED: Partial<VehicleApprovalUrlState> = {
  q: undefined,
  vehicleType: ALL_FILTER,
  storefrontKind: ALL_FILTER,
  status: undefined,
  submittedFrom: undefined,
  submittedTo: undefined,
};

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function PageFallback() {
  const t = useTranslations('Approvals.page');
  return <LoadingState variant="page" label={t('loading')} />;
}

export default function VehicleApprovalsPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <VehicleApprovalsView />
    </Suspense>
  );
}

/**
 * "DUYỆT XE" — hàng đợi duyệt xe lên chợ của nền tảng (24/09/2026).
 *
 * Chỉ PHIẾU XE — ô tô và xe máy, của gian hàng lẫn chủ xe cá nhân. Loại phiếu là điều kiện của
 * endpoint (`/platform/vehicle-approvals`), không phải một bộ lọc client: phiếu gian hàng, hồ sơ
 * người bán hay giấy tờ không thể lọt vào đây kể cả khi ai đó sửa URL.
 *
 * Mọi bộ lọc, trang và phiếu đang mở sống ở URL (ADR 0004) — tải lại, Back, và link gửi cho đồng
 * nghiệp đều rơi đúng chỗ. Lọc, đếm và phân trang chạy ở SERVER; số trên tab đến từ cùng lần đọc
 * với danh sách.
 */
function VehicleApprovalsView() {
  const t = useTranslations('Approvals');
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useVehicleApprovalFilters();
  const { data, isError, refetch, isFetching } = useVehicleApprovals(filters);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: VEHICLE_APPROVALS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const counts = data?.counts;

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'storefrontKind',
      label: t('filters.source'),
      allowClear: false,
      options: [
        { value: ALL_FILTER, label: t('filters.all') },
        ...STOREFRONT_KIND_VALUES.map((kind) => ({
          value: kind,
          label: domainLabel('storefrontKind', kind),
        })),
      ],
    },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      allowClear: false,
      options: [
        ...APPROVAL_STATUS_FILTER_ORDER.map((status) => ({
          value: status,
          label: domainLabel('approvalStatus', status),
        })),
        { value: APPROVAL_STATUS_ANY, label: t('filters.anyStatus') },
      ],
    },
    {
      kind: 'dateRange',
      fromKey: 'submittedFrom',
      toKey: 'submittedTo',
      label: t('filters.submittedAt'),
    },
  ];

  const filtered = Boolean(
    filters.q ||
    filters.vehicleType !== ALL_FILTER ||
    filters.storefrontKind !== ALL_FILTER ||
    filters.status !== VEHICLE_APPROVALS_DEFAULT_STATUS ||
    filters.submittedFrom ||
    filters.submittedTo,
  );

  /*
   * Trước/sau theo thứ tự người duyệt đang nhìn thấy trên bảng.
   *
   * Duyệt xong một xe ở hàng đợi CHỜ ⇒ danh sách nạp lại và xe đó rời trang — nếu chỉ đọc trang
   * hiện tại thì "Xe sau" tắt ngay đúng lúc người duyệt cần nó nhất. Nên thứ tự lần cuối thấy
   * phiếu đang mở trên trang được giữ lại, và chỉ dùng thay khi phiếu đó KHÔNG còn trên trang.
   *
   * Ghi nhớ ngay trong lúc render (mẫu "chỉnh state theo props" của React), không chỉ lúc bấm
   * "Xem chi tiết": vào thẳng bằng link hay F5 với `?task=` cũng phải có thứ tự để giữ.
   */
  const [openedOrder, setOpenedOrder] = useState<readonly string[]>([]);
  const liveOrder = items.map((row) => row.approvalTaskId);
  if (filters.task && liveOrder.includes(filters.task) && !sameOrder(openedOrder, liveOrder)) {
    setOpenedOrder(liveOrder);
  }
  const order =
    filters.task && !liveOrder.includes(filters.task) && openedOrder.includes(filters.task)
      ? openedOrder
      : liveOrder;
  const openIndex = filters.task ? order.indexOf(filters.task) : -1;
  const previousId = openIndex > 0 ? order[openIndex - 1]! : null;
  const nextId = openIndex >= 0 && openIndex < order.length - 1 ? order[openIndex + 1]! : null;

  const openTask = (task: string | undefined) => {
    if (task) setOpenedOrder(order);
    setFilters({ task }, { resetPage: false });
  };

  const tabLabel = (text: string, count: number | undefined) => (
    <span className={styles.tabLabel}>
      {text}
      {count === undefined ? null : <span className={styles.tabCount}>{count}</span>}
    </span>
  );

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <Tabs
        className={styles.tabs}
        aria-label={t('tabs.ariaLabel')}
        activeKey={filters.vehicleType}
        onChange={(key) => setFilters({ vehicleType: key })}
        items={[
          { key: ALL_FILTER, label: tabLabel(t('tabs.all'), counts?.all) },
          ...VEHICLE_TYPE_VALUES.map((type) => ({
            key: type,
            label: tabLabel(domainLabel('vehicleType', type), counts?.[type]),
          })),
        ]}
      />

      <FilterBar
        compactFields
        fields={fields}
        values={filterBarValues(filters)}
        onChange={(patch) => setFilters(filterBarPatch(patch))}
        onClear={filtered ? () => setFilters(CLEARED) : undefined}
      />

      <VehicleApprovalTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={filtered}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => openTask(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <VehicleApprovalDrawer
        taskId={filters.task ?? null}
        previousId={previousId}
        nextId={nextId}
        onNavigate={(id) => openTask(id)}
        onClose={() => openTask(undefined)}
      />
    </div>
  );
}
