'use client';

import { Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  type PaginationMeta,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { isZeroMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import type { TenantCustomer } from '../types';
import styles from './CustomerTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { LIST_SEPARATOR } from '@xeprime/domain';

const MIN_TABLE_WIDTH = 1040;

interface CustomerTableProps {
  items: TenantCustomer[];
  meta: PaginationMeta;
  loading: boolean;
  error: { onRetry: () => void } | null;
  filtered: boolean;
  canViewFinance: boolean;
  /** Không có `customers.view` — hiện màn thiếu quyền thay vì bảng rỗng khó hiểu. */
  permissionDenied: boolean;
  emptyAction?: ReactNode;
  onClearFilters: () => void;
  onOpen: (customer: TenantCustomer) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Nhãn "khách quen" — một định nghĩa (types) cho cả KPI, bộ lọc và huy hiệu này. */
function ReturningTag({ count, label }: { count: number; label: string }) {
  if (count < TENANT_CUSTOMER_RETURNING_MIN_RENTALS) return null;
  return <Tag color="green">{label}</Tag>;
}

/** Còn nợ nổi bật khi khác 0; so sánh trên CHUỖI, không `Number()` (ADR 0007). */
function DebtValue({ value }: { value: string | null | undefined }) {
  const fmt = useAppFormat();

  // `null` = KHÔNG được xem tiền (server quyết). Khác hẳn 0 đồng — nên hiện gạch, không hiện 0.
  if (value === null || value === undefined) return <span className={styles.muted}>—</span>;
  return (
    <span className={cx(styles.money, !isZeroMoney(value) && styles.debt)}>
      {fmt.money(value)}
    </span>
  );
}

export function CustomerTable({
  items,
  meta,
  loading,
  error,
  filtered,
  canViewFinance,
  permissionDenied,
  emptyAction,
  onClearFilters,
  onOpen,
  onPageChange,
}: CustomerTableProps) {
  const t = useTranslations('Customers');
  const fmt = useAppFormat();

  const riskTags = (row: TenantCustomer) => (
    <div className={styles.tags}>
      {row.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL ? (
        <ReturningTag count={row.completedRentalCount} label={t('card.returning')} />
      ) : (
        <StatusTag
          value={row.riskLevel as TenantCustomerRiskLevel}
          meta={TENANT_CUSTOMER_RISK_LEVEL_META}
          group="tenantCustomerRiskLevel"
        />
      )}
      {row.archivedAt ? <Tag>{t('card.archived')}</Tag> : null}
    </div>
  );

  const columns: DataTableColumn<TenantCustomer>[] = [
    {
      title: t('card.identity'),
      key: 'identity',
      width: 280,
      render: (_, row) => (
        <EntityIdentity
          name={row.fullName}
          subtitle={[row.phone, row.email].filter(Boolean).join(LIST_SEPARATOR)}
          kind="person"
          initialSource={row.fullName}
        />
      ),
    },
    {
      title: t('card.rentals'),
      key: 'rentals',
      width: 150,
      align: 'right',
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.number}>{row.completedRentalCount}</span>
          {row.activeBookingCount > 0 ? (
            <span className={styles.meta}>
              {t('card.activeBookings', { count: row.activeBookingCount })}
            </span>
          ) : null}
        </div>
      ),
    },
    // Hai cột tiền CHỈ tồn tại khi có quyền — không render cột rồi để trống, vì một cột "Còn nợ"
    // toàn dấu gạch trông như "không ai nợ gì".
    ...(canViewFinance
      ? ([
          {
            title: t('card.totalValue'),
            key: 'total',
            width: 160,
            align: 'right',
            render: (_, row) => (
              <span className={styles.money}>{fmt.money(row.totalBookingAmount)}</span>
            ),
          },
          {
            title: t('card.debt'),
            key: 'debt',
            width: 150,
            align: 'right',
            render: (_, row) => <DebtValue value={row.debtAmount} />,
          },
        ] as DataTableColumn<TenantCustomer>[])
      : []),
    {
      title: t('card.lastRental'),
      key: 'last',
      width: 140,
      render: (_, row) =>
        row.lastRentalAt ? (
          fmt.date(row.lastRentalAt)
        ) : (
          <span className={styles.muted}>{t('card.neverRented')}</span>
        ),
    },
    {
      title: t('card.status'),
      key: 'risk',
      width: 180,
      render: (_, row) => riskTags(row),
    },
    {
      title: t('card.actions'),
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 130,
      render: (_, row) => (
        <Button size="small" onClick={() => onOpen(row)}>
          {t('card.open')}
        </Button>
      ),
    },
  ];

  /**
   * Thẻ mobile dựng RIÊNG, không để `DataTable` tự đổ cột thành nhãn–giá trị: ở ngoài bãi xe
   * người ta cần đọc được danh tính + cảnh báo trong một liếc mắt, còn "Tổng giá trị" là thông
   * tin hạng hai. Nhờ thẻ riêng, thân trang không bao giờ phải cuộn ngang.
   */
  const renderCard = (row: TenantCustomer) => (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <EntityIdentity
          name={row.fullName}
          subtitle={row.phone}
          kind="person"
          size="sm"
          initialSource={row.fullName}
        />
        {riskTags(row)}
      </header>

      <dl className={styles.cardMetrics}>
        <div>
          <dt>{t('card.rentals')}</dt>
          <dd>{row.completedRentalCount}</dd>
        </div>
        <div>
          <dt>{t('card.lastRentalShort')}</dt>
          <dd>{row.lastRentalAt ? fmt.date(row.lastRentalAt) : '—'}</dd>
        </div>
        {canViewFinance ? (
          <div>
            <dt>{t('card.debt')}</dt>
            <dd>
              <DebtValue value={row.debtAmount} />
            </dd>
          </div>
        ) : null}
      </dl>

      <Button block className={styles.cardAction} onClick={() => onOpen(row)}>
        {t('card.open')}
      </Button>
    </article>
  );

  return (
    <DataTable<TenantCustomer>
      label={t('list.label')}
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('list.errorTitle'), onRetry: error.onRetry } : null}
      permission={
        permissionDenied
          ? { title: t('permission.title'), description: t('permission.description') }
          : null
      }
      filtered={filtered}
      empty={{
        title: t('list.emptyTitle'),
        description: t('list.emptyBody'),
        action: emptyAction ?? undefined,
      }}
      noResults={{
        title: t('list.noResultsTitle'),
        description: t('list.noResultsBody'),
        action: <Button onClick={onClearFilters}>{t('list.clearFilters')}</Button>,
      }}
      onRowClick={onOpen}
      renderCard={renderCard}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('page.totalLabel', { count: total }),
      }}
    />
  );
}
