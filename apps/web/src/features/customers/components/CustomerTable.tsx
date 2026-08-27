'use client';

import { Button, Tag } from 'antd';
import type { ReactNode } from 'react';
import {
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS, TENANT_CUSTOMER_RISK_LEVEL, TENANT_CUSTOMER_RISK_LEVEL_META, type PaginationMeta, type TenantCustomerRiskLevel, } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { isZeroMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import type { TenantCustomer } from '../types';
import styles from './CustomerTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

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
function ReturningTag({ count }: { count: number }) {
  if (count < TENANT_CUSTOMER_RETURNING_MIN_RENTALS) return null;
  return <Tag color="green">Khách quen</Tag>;
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
  const fmt = useAppFormat();

  const columns: DataTableColumn<TenantCustomer>[] = [
    {
      title: 'Khách hàng',
      key: 'identity',
      width: 280,
      render: (_, row) => (
        <EntityIdentity
          name={row.fullName}
          subtitle={[row.phone, row.email].filter(Boolean).join(' · ')}
          kind="person"
          initialSource={row.fullName}
        />
      ),
    },
    {
      title: 'Số lần thuê',
      key: 'rentals',
      width: 150,
      align: 'right',
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.number}>{row.completedRentalCount}</span>
          {row.activeBookingCount > 0 ? (
            <span className={styles.meta}>{row.activeBookingCount} đơn đang chạy</span>
          ) : null}
        </div>
      ),
    },
    // Hai cột tiền CHỈ tồn tại khi có quyền — không render cột rồi để trống, vì một cột "Còn nợ"
    // toàn dấu gạch trông như "không ai nợ gì".
    ...(canViewFinance
      ? ([
          {
            title: 'Tổng giá trị',
            key: 'total',
            width: 160,
            align: 'right',
            render: (_, row) => (
              <span className={styles.money}>{fmt.money(row.totalBookingAmount)}</span>
            ),
          },
          {
            title: 'Còn nợ',
            key: 'debt',
            width: 150,
            align: 'right',
            render: (_, row) => <DebtValue value={row.debtAmount} />,
          },
        ] as DataTableColumn<TenantCustomer>[])
      : []),
    {
      title: 'Lần thuê cuối',
      key: 'last',
      width: 140,
      render: (_, row) =>
        row.lastRentalAt ? (
          fmt.date(row.lastRentalAt)
        ) : (
          <span className={styles.muted}>Chưa thuê</span>
        ),
    },
    {
      title: 'Trạng thái',
      key: 'risk',
      width: 180,
      render: (_, row) => (
        <div className={styles.tags}>
          {row.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL ? (
            <ReturningTag count={row.completedRentalCount} />
          ) : (
            <StatusTag
              value={row.riskLevel as TenantCustomerRiskLevel}
              meta={TENANT_CUSTOMER_RISK_LEVEL_META} group="tenantCustomerRiskLevel"
            />
          )}
          {row.archivedAt ? <Tag>Đã lưu trữ</Tag> : null}
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 130,
      render: (_, row) => (
        <Button size="small" onClick={() => onOpen(row)}>
          Xem hồ sơ
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
        <div className={styles.tags}>
          {row.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL ? (
            <ReturningTag count={row.completedRentalCount} />
          ) : (
            <StatusTag
              value={row.riskLevel as TenantCustomerRiskLevel}
              meta={TENANT_CUSTOMER_RISK_LEVEL_META} group="tenantCustomerRiskLevel"
            />
          )}
          {row.archivedAt ? <Tag>Đã lưu trữ</Tag> : null}
        </div>
      </header>

      <dl className={styles.cardMetrics}>
        <div>
          <dt>Số lần thuê</dt>
          <dd>{row.completedRentalCount}</dd>
        </div>
        <div>
          <dt>Lần cuối</dt>
          <dd>{row.lastRentalAt ? fmt.date(row.lastRentalAt) : '—'}</dd>
        </div>
        {canViewFinance ? (
          <div>
            <dt>Còn nợ</dt>
            <dd>
              <DebtValue value={row.debtAmount} />
            </dd>
          </div>
        ) : null}
      </dl>

      <Button block className={styles.cardAction} onClick={() => onOpen(row)}>
        Xem hồ sơ
      </Button>
    </article>
  );

  return (
    <DataTable<TenantCustomer>
      label="Sổ khách của gian hàng"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={
        error ? { title: 'Không tải được danh sách khách hàng', onRetry: error.onRetry } : null
      }
      permission={
        permissionDenied
          ? {
              title: 'Bạn chưa có quyền xem sổ khách',
              description: 'Liên hệ chủ gian hàng để được cấp quyền "Khách hàng".',
            }
          : null
      }
      filtered={filtered}
      empty={{
        title: 'Sổ khách còn trống',
        description:
          'Khách sẽ tự vào sổ khi bạn lập đơn thuê hoặc nhận yêu cầu từ Marketplace. Bạn cũng có thể thêm tay ngay bây giờ.',
        action: emptyAction ?? undefined,
      }}
      noResults={{
        title: 'Không có khách nào khớp bộ lọc',
        description: 'Thử bỏ bớt điều kiện lọc hoặc tìm bằng số điện thoại.',
        action: <Button onClick={onClearFilters}>Xoá bộ lọc</Button>,
      }}
      onRowClick={onOpen}
      renderCard={renderCard}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => `${total} khách`,
      }}
    />
  );
}
