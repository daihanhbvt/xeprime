'use client';

import { CheckCircleFilled, EyeOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_LICENCE_STATE,
  USER_STATUS_META,
  vnDateKey,
  type CustomerLicenceState,
  type PaginationMeta,
  type UserStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { CUSTOMER_LICENCE_STATE_COLOR } from '../constants';
import type { AdminCustomer } from '../types';
import styles from './AdminCustomerTable.module.css';

interface AdminCustomerTableProps {
  items: AdminCustomer[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Suy từ tổng bề rộng cột (P25) — 10 cột, ba cột đếm hẹp. */
const MIN_TABLE_WIDTH = 1320;

export function AdminCustomerTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AdminCustomerTableProps) {
  const t = useTranslations('AdminCustomers');
  const fmt = useAppFormat();
  const today = vnDateKey(new Date());

  const columns: DataTableColumn<AdminCustomer>[] = [
    {
      title: t('table.customer'),
      key: 'name',
      width: 220,
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.displayName}</div>
          {/* Email LUÔN che ở danh sách — bỏ che chỉ xảy ra trong panel chi tiết và có ghi audit. */}
          <div className={styles.meta}>{r.emailMasked ?? '—'}</div>
        </div>
      ),
    },
    {
      title: t('table.phone'),
      key: 'phone',
      width: 150,
      render: (_, r) => (
        <span className={styles.phoneCell}>
          <span className={styles.masked}>{r.phoneMasked ?? '—'}</span>
          {r.phoneVerified ? (
            <Tooltip title={t('table.phoneVerified')}>
              {/* Màu lấy từ token (ADR 0003), không hard-code hex trong component. */}
              <CheckCircleFilled
                className={styles.verified}
                aria-label={t('table.phoneVerified')}
              />
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      title: t('table.licence'),
      key: 'licence',
      width: 160,
      render: (_, r) => {
        const state = r.licenceState as CustomerLicenceState;
        const expired = Boolean(r.licenceExpiresOn && r.licenceExpiresOn < today);
        return (
          <div>
            <Tag color={CUSTOMER_LICENCE_STATE_COLOR[state]}>{t(`licenceState.${state}`)}</Tag>
            {state === CUSTOMER_LICENCE_STATE.VERIFIED && r.licenceExpiresOn ? (
              <div className={expired ? styles.expired : styles.meta}>
                {t(expired ? 'table.licenceExpired' : 'table.licenceExpiresOn', {
                  date: fmt.dateKey(r.licenceExpiresOn),
                })}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('table.requests'),
      key: 'requestCount',
      align: 'right',
      width: 100,
      render: (_, r) => r.requestCount,
    },
    {
      title: t('table.booked'),
      key: 'bookedCount',
      align: 'right',
      width: 110,
      render: (_, r) => r.bookedCount,
    },
    {
      title: t('table.reviews'),
      key: 'reviewCount',
      align: 'right',
      width: 100,
      render: (_, r) => r.reviewCount,
    },
    {
      title: t('table.status'),
      key: 'status',
      width: 120,
      render: (_, r) => (
        <StatusTag value={r.status as UserStatus} meta={USER_STATUS_META} group="userStatus" />
      ),
    },
    {
      title: t('table.lastLogin'),
      key: 'lastLoginAt',
      width: 170,
      render: (_, r) => (r.lastLoginAt ? fmt.dateTime(r.lastLoginAt) : t('table.neverLoggedIn')),
    },
    {
      title: t('table.createdAt'),
      key: 'createdAt',
      width: 120,
      render: (_, r) => fmt.date(r.createdAt),
    },
    actionColumn<AdminCustomer>((row) => [
      { key: 'view', label: t('table.view'), icon: <EyeOutlined />, onClick: () => onView(row.id) },
    ]),
  ];

  return (
    <DataTable<AdminCustomer>
      label={t('table.label')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('table.loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('table.empty') }}
      noResults={{
        title: t('table.noResults'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{t('table.clearFilters')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('table.total', { count: total }),
      }}
    />
  );
}
