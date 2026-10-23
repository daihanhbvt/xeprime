'use client';

import { Checkbox, Select, Space } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { CUSTOMER_LICENCE_STATE_VALUES, USER_STATUS_VALUES } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import { ADMIN_CUSTOMERS_DEFAULT_LIMIT } from '@/features/admin-customers/api';
import { AdminCustomerDetailDrawer } from '@/features/admin-customers/components/AdminCustomerDetailDrawer';
import { AdminCustomerTable } from '@/features/admin-customers/components/AdminCustomerTable';
import { useAdminCustomerFilters } from '@/features/admin-customers/hooks/use-admin-customer-filters';
import { useAdminCustomers } from '@/features/admin-customers/hooks/use-admin-customers';
import type { AdminCustomerFilters } from '@/features/admin-customers/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './customers-page.module.css';

const CLEARED: Partial<AdminCustomerFilters> = {
  q: undefined,
  phone: undefined,
  email: undefined,
  status: ALL_FILTER,
  licence: ALL_FILTER,
  hasRequests: false,
};

function PageFallback() {
  const t = useTranslations('AdminCustomers.page');
  return <LoadingState variant="page" label={t('loading')} />;
}

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AdminCustomersView />
    </Suspense>
  );
}

function AdminCustomersView() {
  const t = useTranslations('AdminCustomers');
  const dl = useDomainLabel();
  const { filters, setFilters } = useAdminCustomerFilters();
  const { data, isError, refetch, isFetching } = useAdminCustomers(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_CUSTOMERS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const hasFilters = Boolean(
    filters.q ||
    filters.phone ||
    filters.email ||
    (filters.status && filters.status !== ALL_FILTER) ||
    (filters.licence && filters.licence !== ALL_FILTER) ||
    filters.hasRequests,
  );

  return (
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
              className={styles.exact}
              size="large"
              placeholder={t('filters.phonePlaceholder')}
              aria-label={t('filters.phoneLabel')}
              value={filters.phone}
              onSearch={(value) => setFilters({ phone: value || undefined })}
            />
            <AutoSearchInput
              className={styles.exact}
              size="large"
              placeholder={t('filters.emailPlaceholder')}
              aria-label={t('filters.emailLabel')}
              value={filters.email}
              onSearch={(value) => setFilters({ email: value || undefined })}
            />
            <Select
              className={styles.statusSelect}
              size="large"
              aria-label={t('filters.statusLabel')}
              value={filters.status ?? ALL_FILTER}
              options={[
                { value: ALL_FILTER, label: t('filters.allStatuses') },
                ...USER_STATUS_VALUES.map((value) => ({
                  value,
                  label: dl('userStatus', value),
                })),
              ]}
              onChange={(value: string) => setFilters({ status: value })}
            />
            <Select
              className={styles.statusSelect}
              size="large"
              aria-label={t('filters.licenceLabel')}
              value={filters.licence ?? ALL_FILTER}
              options={[
                { value: ALL_FILTER, label: t('filters.allLicences') },
                ...CUSTOMER_LICENCE_STATE_VALUES.map((value) => ({
                  value,
                  label: t(`licenceState.${value}`),
                })),
              ]}
              onChange={(value: string) => setFilters({ licence: value })}
            />
            <Checkbox
              checked={Boolean(filters.hasRequests)}
              onChange={(e) => setFilters({ hasRequests: e.target.checked })}
            >
              {t('filters.hasRequests')}
            </Checkbox>
          </Space>
        }
      />

      <div className={styles.privacyNote}>{t('page.privacyNote')}</div>

      <AdminCustomerTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => setSelected(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <AdminCustomerDetailDrawer customerId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
