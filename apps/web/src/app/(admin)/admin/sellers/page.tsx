'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SELLER_PROFILE_STATUS, SELLER_PROFILE_STATUS_META, SELLER_PROFILE_STATUS_VALUES, type SellerProfileStatus } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { SELLER_DEFAULT_LIMIT } from '@/features/platform-sellers/api';
import { PlatformSellerDrawer } from '@/features/platform-sellers/components/PlatformSellerDrawer';
import { usePlatformSellers } from '@/features/platform-sellers/hooks/use-platform-sellers';
import type { PlatformSellerFilters, PlatformSellerProfile } from '@/features/platform-sellers/types';

const MIN_TABLE_WIDTH = 900;

/**
 * Hàng đợi xác minh người bán — ADR 0028 release gate 1 (R3).
 *
 * Mặc định chỉ hiện hồ sơ CHỜ XÁC MINH: đây là việc-cần-làm, không phải sổ lịch sử. PII đã che
 * ở danh sách (`maskAccountNumber` phía backend) — mở một hồ sơ mới thấy đủ, và lượt mở đó là
 * một request riêng truy được trong log.
 */
export default function AdminSellersPage() {
  const t = useTranslations('PlatformSellers');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const [filters, setFilters] = useState<PlatformSellerFilters>({
    status: SELLER_PROFILE_STATUS.SUBMITTED,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isError, isFetching, refetch } = usePlatformSellers(filters);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: SELLER_DEFAULT_LIMIT, total: 0, hasNext: false };

  function patch(next: Partial<PlatformSellerFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  const filterFields: FilterField[] = [
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
      options: SELLER_PROFILE_STATUS_VALUES.map((status) => ({
        value: status,
        label: domainLabel('sellerProfileStatus', status),
      })),
      allowClear: true,
    },
  ];

  const columns: DataTableColumn<PlatformSellerProfile>[] = [
    { title: t('columns.tenant'), key: 'tenant', render: (_, row) => row.tenantName },
    {
      title: t('columns.entityType'),
      key: 'entityType',
      width: 140,
      render: (_, row) => domainLabel('sellerEntityType', row.entityType),
    },
    {
      title: t('columns.legalName'),
      key: 'legalName',
      render: (_, row) => row.legalName ?? tCommon('labels.emptyValue'),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as SellerProfileStatus}
          meta={SELLER_PROFILE_STATUS_META}
          group="sellerProfileStatus"
        />
      ),
    },
    {
      title: t('columns.submittedAt'),
      key: 'submittedAt',
      width: 160,
      render: (_, row) => (row.submittedAt ? fmt.dateTime(row.submittedAt) : tCommon('labels.emptyValue')),
    },
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, status: filters.status ?? SELLER_PROFILE_STATUS.SUBMITTED }}
        onChange={(next) => patch({ q: next.q, status: next.status })}
      />

      <DataTable<PlatformSellerProfile>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{ title: t('page.empty') }}
        onRowClick={(row) => setOpenId(row.id)}
        pagination={{
          meta,
          onChange: (page, limit) => patch({ page, limit }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

      <PlatformSellerDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
