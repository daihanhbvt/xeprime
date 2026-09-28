'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DEFAULT_PARTNER_VEHICLE_SORT,
  PARTNER_VEHICLE_SORT_VALUES,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
} from '@xeprime/types';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { PARTNER_DETAIL_PAGE_SIZE, type PartnerOverview, type PartnerVehicleFilters } from './api';
import { usePartnerVehicles } from './hooks';
import { PartnerVehicleTable, useTabState } from './parts';
import styles from './PartnerDetail.module.css';

const EMPTY_FILTERS: PartnerVehicleFilters = {};

/**
 * Tab Xe — danh sách xe của MỘT đối tác, lọc/sắp xếp/phân trang ở server.
 *
 * Bộ lọc sống trong state của tab, KHÔNG ở URL: URL đang chứa bộ lọc của danh sách đối tác phía
 * sau (`q`, `status`, `sort`…), và hai bộ trùng tên khoá sẽ giẫm lên nhau. Chỉ tab đang mở ở URL.
 */
export function VehiclesTab({
  overview,
  isPackage,
}: {
  overview: PartnerOverview;
  isPackage: boolean;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.vehicles');
  const tTab = useTranslations('AdminTenants.partnerDetail');
  const domainLabel = useDomainLabel();
  const [filters, setFilters] = useState<PartnerVehicleFilters>(EMPTY_FILTERS);
  const query = usePartnerVehicles(overview.identity.id, filters, true);

  const all = { value: ALL_FILTER, label: t('filters.all') };
  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'operationStatus',
      label: t('filters.operation'),
      allowClear: false,
      options: [
        all,
        ...VEHICLE_OPERATION_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('vehicleOperationStatus', value),
        })),
      ],
    },
    ...(isPackage && overview.branches && overview.branches.length > 0
      ? [
          {
            kind: 'select',
            key: 'branchId',
            label: t('filters.branch'),
            allowClear: false,
            options: [
              all,
              ...overview.branches.map((branch) => ({ value: branch.id, label: branch.name })),
            ],
          } satisfies FilterField,
        ]
      : []),
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
    {
      kind: 'select',
      key: 'publicStatus',
      label: t('filters.marketplace'),
      allowClear: false,
      options: [
        all,
        ...VEHICLE_PUBLIC_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('vehiclePublicStatus', value),
        })),
      ],
    },
    {
      kind: 'select',
      key: 'sort',
      label: t('filters.sort'),
      allowClear: false,
      options: PARTNER_VEHICLE_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    },
  ];

  const filtered = Boolean(
    filters.q ||
    filters.operationStatus ||
    filters.publicStatus ||
    filters.serviceType ||
    filters.branchId,
  );

  function update(patch: Record<string, string | undefined>) {
    const next: PartnerVehicleFilters = { ...filters, page: undefined };
    for (const [key, value] of Object.entries(patch)) {
      (next as Record<string, string | undefined>)[key] =
        !value || value === ALL_FILTER ? undefined : value;
    }
    setFilters(next);
  }

  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: tTab('denied.vehicles'),
  });

  const { counts } = overview;
  return (
    <div className={styles.tabBody}>
      <FilterBar
        fields={fields}
        values={{
          q: filters.q,
          operationStatus: filters.operationStatus ?? ALL_FILTER,
          branchId: filters.branchId ?? ALL_FILTER,
          serviceType: filters.serviceType ?? ALL_FILTER,
          publicStatus: filters.publicStatus ?? ALL_FILTER,
          sort: filters.sort ?? DEFAULT_PARTNER_VEHICLE_SORT,
        }}
        onChange={update}
      />
      <div className={styles.summaryLine}>
        <span>{t('summary.total', { count: counts.vehicles })}</span>
        <span>· {t('summary.listed', { count: counts.listed })}</span>
        <span>· {t('summary.renting', { count: counts.renting })}</span>
        {counts.vehiclesWithAlerts != null ? (
          <span>· {t('summary.attention', { count: counts.vehiclesWithAlerts })}</span>
        ) : null}
      </div>
      {state ?? (
        <PartnerVehicleTable
          items={query.data?.items ?? []}
          isPackage={isPackage}
          loading={query.isFetching}
          filtered={filtered}
          onClearFilters={() => setFilters({ sort: filters.sort })}
          pagination={{
            page: query.data?.meta.page ?? 1,
            total: query.data?.meta.total ?? 0,
            pageSize: PARTNER_DETAIL_PAGE_SIZE,
            onChange: (page) => setFilters({ ...filters, page }),
          }}
        />
      )}
    </div>
  );
}
