'use client';

import { Suspense, useState } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { AUDIT_LOGS_DEFAULT_LIMIT } from '@/features/admin-audit/api';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_SCOPE_OPTIONS,
  AUDIT_TARGET_TYPE_OPTIONS,
} from '@/features/admin-audit/constants';
import { AuditLogDetailDrawer } from '@/features/admin-audit/components/AuditLogDetailDrawer';
import { AuditLogTable } from '@/features/admin-audit/components/AuditLogTable';
import { useAuditFilters } from '@/features/admin-audit/hooks/use-audit-filters';
import { useAuditLogs } from '@/features/admin-audit/hooks/use-audit-logs';

/** Đưa mọi bộ lọc về mặc định. `'all'` và `undefined` đều bị `useUrlFilters` xoá khỏi URL. */
const CLEARED = {
  actorScope: 'all',
  action: 'all',
  targetType: 'all',
  dateFrom: undefined,
  dateTo: undefined,
} as const;

const FILTER_FIELDS: FilterField[] = [
  { kind: 'segmented', key: 'actorScope', label: 'Phạm vi', options: AUDIT_SCOPE_OPTIONS },
  // Gần 30 loại hành động → cho gõ để lọc, giữ đúng `showSearch` đang có.
  {
    kind: 'select',
    key: 'action',
    label: 'Hành động',
    options: AUDIT_ACTION_OPTIONS,
    searchable: true,
  },
  { kind: 'select', key: 'targetType', label: 'Đối tượng', options: AUDIT_TARGET_TYPE_OPTIONS },
  { kind: 'dateRange', fromKey: 'dateFrom', toKey: 'dateTo', label: 'Khoảng ngày' },
];

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" label="Đang tải nhật ký hệ thống…" />}>
      <AdminAuditView />
    </Suspense>
  );
}

function AdminAuditView() {
  const { filters, setFilters } = useAuditFilters();
  const { data, isError, refetch, isFetching } = useAuditLogs(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: AUDIT_LOGS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(
    (filters.actorScope && filters.actorScope !== 'all') ||
    (filters.action && filters.action !== 'all') ||
    (filters.targetType && filters.targetType !== 'all') ||
    filters.dateFrom ||
    filters.dateTo,
  );

  return (
    <div>
      <ManagePageHeader title="Nhật ký hệ thống" />

      <FilterBar
        fields={FILTER_FIELDS}
        values={filters as Record<string, string | undefined>}
        onChange={(patch) => setFilters(patch)}
      />

      <AuditLogTable
        items={items}
        meta={meta}
        loading={isFetching}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ để hiển thị — refetch nền hỏng thì giữ bảng.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => setSelected(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <AuditLogDetailDrawer logId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
