'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import {
  DEFAULT_PLATFORM_TENANT_SORT,
  PLATFORM_PARTNER_KIND,
  PLATFORM_TENANT_PLAN_FILTER_VALUES,
  isPlatformTenantSort,
  type PlatformPartnerKind,
} from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { ADMIN_TENANTS_DEFAULT_LIMIT } from '../api';
import { ADMIN_TENANT_SORT_OPTIONS, ADMIN_TENANT_STATUS_FILTER_ORDER } from '../constants';
import { useAdminTenantFilters } from '../hooks/use-admin-tenant-filters';
import { useAdminTenants } from '../hooks/use-admin-tenants';
import type { AdminPartnerListUrlState } from '../types';
import { PartnerDetailDrawer } from '../partner-detail/PartnerDetailDrawer';
import { AdminTenantTable } from './AdminTenantTable';

/** "Xoá bộ lọc" chỉ đụng bộ lọc — giữ nguyên cách sắp xếp và gian hàng đang mở. */
const CLEARED: Partial<AdminPartnerListUrlState> = {
  q: undefined,
  status: ALL_FILTER,
  planState: ALL_FILTER,
};

/**
 * Patch của `FilterBar` → patch URL. Chỉ nhận ba khoá của thanh lọc; sort mặc định thì XOÁ tham
 * số thay vì ghi `?sort=newest`, để link của trạng thái mặc định vẫn là URL trần.
 */
function filterBarPatch(
  patch: Readonly<Record<string, string | undefined>>,
): Partial<AdminPartnerListUrlState> {
  const out: Partial<AdminPartnerListUrlState> = {};
  if ('q' in patch) out.q = patch.q;
  if ('status' in patch) out.status = patch.status;
  if ('planState' in patch) out.planState = patch.planState;
  if ('sort' in patch) {
    out.sort =
      isPlatformTenantSort(patch.sort) && patch.sort !== DEFAULT_PLATFORM_TENANT_SORT
        ? patch.sort
        : undefined;
  }
  return out;
}

interface AdminPartnerListPageProps {
  /** Loại đối tác CỐ ĐỊNH của route — không đọc từ URL, không đổi được bằng query string. */
  partnerKind: PlatformPartnerKind;
}

/**
 * Danh sách đối tác của Platform Admin — MỘT hiện thực cho cả "Gian hàng gói"
 * (`/manage/admin/partners/shops`) và "Chủ xe cá nhân" (`/manage/admin/partners/owners`).
 *
 * Hai route chỉ khác `partnerKind`. Loại đi thẳng vào tham số API, nên tìm kiếm, trạng thái, sắp
 * xếp, phân trang và tổng số đều do server tính BÊN TRONG một loại (`PlatformTenantsService`).
 * Panel chi tiết và nút mở phiên hỗ trợ dùng chung: server tự chọn workspace của phiên (ADR 0050
 * điều 2), trang này không truyền loại nào đi kèm.
 */
export function AdminPartnerListPage({ partnerKind }: AdminPartnerListPageProps) {
  return (
    <Suspense fallback={<ListFallback partnerKind={partnerKind} />}>
      <AdminPartnerListView partnerKind={partnerKind} />
    </Suspense>
  );
}

function ListFallback({ partnerKind }: AdminPartnerListPageProps) {
  const t = useTranslations(`AdminTenants.list.kinds.${partnerKind}`);
  return <LoadingState variant="page" label={t('loading')} />;
}

function AdminPartnerListView({ partnerKind }: AdminPartnerListPageProps) {
  const t = useTranslations('AdminTenants.list');
  const tKind = useTranslations(`AdminTenants.list.kinds.${partnerKind}`);
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useAdminTenantFilters();
  const { tenant: openTenantId, tab: openTab, ...listFilters } = filters;
  const { data, isError, refetch, isFetching } = useAdminTenants({
    ...listFilters,
    // URL của danh sách chủ xe không có ô hạn gói — tham số lạc (link chép nhầm) không được lọc ngầm.
    planState: partnerKind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP ? listFilters.planState : undefined,
    partnerKind,
  });

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_TENANTS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const isPackageShop = partnerKind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;
  const hasFilters = Boolean(
    filters.q ||
    (filters.status && filters.status !== ALL_FILTER) ||
    (isPackageShop && filters.planState && filters.planState !== ALL_FILTER),
  );

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: tKind('searchLabel'),
      placeholder: tKind('searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      allowClear: false,
      options: [
        { value: ALL_FILTER, label: t('filters.allStatuses') },
        ...ADMIN_TENANT_STATUS_FILTER_ORDER.map((value) => ({
          value,
          label: domainLabel('tenantStatus', value),
        })),
      ],
    },
    // Hạn gói chỉ có nghĩa ở danh sách gian hàng gói — chủ xe cá nhân không mua kỳ gói nào.
    ...(isPackageShop
      ? [
          {
            kind: 'select' as const,
            key: 'planState',
            label: t('filters.planState'),
            allowClear: false,
            options: [
              { value: ALL_FILTER, label: t('filters.allPlanStates') },
              ...PLATFORM_TENANT_PLAN_FILTER_VALUES.map((value) => ({
                value,
                label: t(`filters.planStates.${value}`),
              })),
            ],
          },
        ]
      : []),
    {
      kind: 'select',
      key: 'sort',
      label: t('filters.sort'),
      allowClear: false,
      options: ADMIN_TENANT_SORT_OPTIONS.map((value) => ({
        value,
        label: domainLabel('platformTenantSort', value),
      })),
    },
  ];

  // Mở/đóng panel chỉ đổi giao diện — không được đưa người dùng về trang 1.
  // Mở đối tác khác thì tab về mặc định (Tổng quan) thay vì mang theo tab của người trước.
  const openTenant = (tenant: string | undefined) =>
    setFilters({ tenant, tab: undefined }, { resetPage: false });

  return (
    <div>
      <ManagePageHeader title={tKind('title')} subtitle={tKind('subtitle')} />

      <FilterBar
        fields={fields}
        values={{
          q: filters.q,
          status: filters.status,
          planState: filters.planState,
          sort: filters.sort ?? DEFAULT_PLATFORM_TENANT_SORT,
        }}
        onChange={(patch) => setFilters(filterBarPatch(patch))}
      />

      <AdminTenantTable
        partnerKind={partnerKind}
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={openTenant}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <PartnerDetailDrawer
        tenantId={openTenantId ?? null}
        tab={openTab}
        onTabChange={(tab) => setFilters({ tab }, { resetPage: false })}
        onClose={() => openTenant(undefined)}
      />
    </div>
  );
}
