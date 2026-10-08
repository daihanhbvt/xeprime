'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useMemo } from 'react';
import {
  AUDIT_ACTION_CATEGORY_VALUES,
  AUDIT_ACTOR_SCOPE_VALUES,
  auditActionCategoryOf,
} from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import { AUDIT_LOGS_DEFAULT_LIMIT } from '@/features/admin-audit/api';
import { AuditContextBanner } from '@/features/admin-audit/components/AuditContextBanner';
import { AuditLogDetailDrawer } from '@/features/admin-audit/components/AuditLogDetailDrawer';
import { AuditLogTable } from '@/features/admin-audit/components/AuditLogTable';
import { useAuditFilters } from '@/features/admin-audit/hooks/use-audit-filters';
import { useAuditLabels } from '@/features/admin-audit/hooks/use-audit-labels';
import { useAuditLogs } from '@/features/admin-audit/hooks/use-audit-logs';
import type { AuditLogFilters } from '@/features/admin-audit/types';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * "Xoá bộ lọc" chỉ đụng các ô lọc — GIỮ tham số sâu (`targetId`/`tenantId`/`actorUserId`): người
 * đến từ một đối tượng vẫn đang xem đối tượng đó, đường về toàn bộ nhật ký là nút riêng ở dải ngữ
 * cảnh. `'all'` và `undefined` đều bị `useUrlFilters` xoá khỏi URL.
 */
const CLEARED: Partial<AuditLogFilters> = {
  q: undefined,
  actorScope: ALL_FILTER,
  category: ALL_FILTER,
  action: ALL_FILTER,
  targetType: ALL_FILTER,
  dateFrom: undefined,
  dateTo: undefined,
};

/** "Xem toàn bộ nhật ký": rời đối tượng đang xem, đóng cả panel đang mở. */
const CLEARED_CONTEXT: Partial<AuditLogFilters> = {
  targetType: ALL_FILTER,
  targetId: undefined,
  tenantId: undefined,
  actorUserId: undefined,
  open: undefined,
};

/** Tìm kiếm + phạm vi + nhóm + khoảng ngày đứng trên hàng; hành động cụ thể và đối tượng dồn vào "Thêm". */
const INLINE_FIELD_LIMIT = 3;

function PageFallback() {
  const t = useTranslations('AdminAudit.page');
  return <LoadingState variant="page" label={t('loading')} />;
}

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AdminAuditView />
    </Suspense>
  );
}

/**
 * Nhật ký hệ thống — chỉ đọc. Bộ lọc, trang và dòng đang mở sống ở URL (ADR 0004). Lọc, đếm và
 * phân trang chạy ở SERVER; nhãn hành động/đối tượng đến từ `Domain` qua `useAuditLabels`, tên
 * đối tượng do server tra.
 */
function AdminAuditView() {
  const t = useTranslations('AdminAudit');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();
  const labels = useAuditLabels();
  const { filters, setFilters } = useAuditFilters();
  const { open, ...listFilters } = filters;
  const { data, isError, refetch, isFetching } = useAuditLogs(listFilters);

  const category = filters.category && filters.category !== ALL_FILTER ? filters.category : null;

  const fields = useMemo<FilterField[]>(() => {
    // Hành động cụ thể: thu hẹp theo nhóm đang chọn — chọn nhóm "Gói thuê bao" thì chỉ còn vài mục.
    const actionOptions = labels.actionCodes
      .filter((code) => !category || auditActionCategoryOf(code) === category)
      .map((value) => ({ value, label: labels.action(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const targetOptions = labels.targetTypeCodes
      .map((value) => ({ value, label: labels.targetType(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.search'),
        placeholder: t('filters.searchPlaceholder'),
      },
      {
        kind: 'segmented',
        key: 'actorScope',
        label: t('filters.scope'),
        options: [
          { value: ALL_FILTER, label: tCommon('all') },
          ...AUDIT_ACTOR_SCOPE_VALUES.map((value) => ({
            value,
            label: domainLabel('auditActorScope', value),
          })),
        ],
      },
      {
        kind: 'select',
        key: 'category',
        label: t('filters.category'),
        allowClear: false,
        options: [
          { value: ALL_FILTER, label: t('filters.allCategories') },
          ...AUDIT_ACTION_CATEGORY_VALUES.map((value) => ({
            value,
            label: domainLabel('auditActionCategory', value),
          })),
        ],
      },
      { kind: 'dateRange', fromKey: 'dateFrom', toKey: 'dateTo', label: t('filters.dateRange') },
      {
        kind: 'select',
        key: 'action',
        label: t('filters.action'),
        options: [{ value: ALL_FILTER, label: t('filters.allActions') }, ...actionOptions],
        searchable: true,
        wideDropdown: true,
      },
      {
        kind: 'select',
        key: 'targetType',
        label: t('filters.target'),
        options: [{ value: ALL_FILTER, label: t('filters.allTargets') }, ...targetOptions],
        searchable: true,
        wideDropdown: true,
      },
    ];
  }, [labels, domainLabel, t, tCommon, category]);

  function applyFilters(patch: Record<string, string | undefined>) {
    const next: Partial<AuditLogFilters> = { ...patch };
    // Đổi nhóm: một hành động cụ thể của nhóm khác không còn hợp lệ — bỏ nó thay vì trả về rỗng.
    if ('category' in patch && filters.action && filters.action !== ALL_FILTER) {
      const nextCategory = patch.category;
      if (
        nextCategory &&
        nextCategory !== ALL_FILTER &&
        auditActionCategoryOf(filters.action) !== nextCategory
      ) {
        next.action = ALL_FILTER;
      }
    }
    setFilters(next);
  }

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: AUDIT_LOGS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(
    filters.q ||
    (filters.actorScope && filters.actorScope !== ALL_FILTER) ||
    category ||
    (filters.action && filters.action !== ALL_FILTER) ||
    (filters.targetType && filters.targetType !== ALL_FILTER) ||
    filters.dateFrom ||
    filters.dateTo,
  );

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <AuditContextBanner
        targetType={filters.targetType !== ALL_FILTER ? filters.targetType : undefined}
        targetId={filters.targetId}
        tenantId={filters.tenantId}
        actorUserId={filters.actorUserId}
        items={items}
        total={meta.total}
        onViewAll={() => setFilters(CLEARED_CONTEXT)}
      />

      <FilterBar
        fields={fields}
        values={filters as Record<string, string | undefined>}
        onChange={applyFilters}
        inlineFieldLimit={INLINE_FIELD_LIMIT}
      />

      <AuditLogTable
        items={items}
        meta={meta}
        loading={isFetching}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ để hiển thị — refetch nền hỏng thì giữ bảng.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => setFilters({ open: id }, { resetPage: false })}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <AuditLogDetailDrawer
        logId={open ?? null}
        contextTargetId={filters.targetId}
        onClose={() => setFilters({ open: undefined }, { resetPage: false })}
      />
    </div>
  );
}
