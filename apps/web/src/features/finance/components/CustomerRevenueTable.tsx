'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION, type PaginationMeta } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { customerPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { isZeroMoney } from '@/lib/money';
import { rowNumberOf } from '@/lib/pagination';
import { useAppFormat } from '@/i18n/use-app-format';
import type { CustomerRevenue, FinanceOverviewFilters } from '../types';
import styles from './VehicleProfitTable.module.css';

interface CustomerRevenueTableProps {
  items: CustomerRevenue[];
  meta: PaginationMeta;
  /** Doanh thu trong kỳ KHÔNG gắn khách nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedRevenue: string | undefined;
  loading: boolean;
  error: { onRetry: () => void } | null;
  onChange: (patch: Partial<FinanceOverviewFilters>) => void;
}

/**
 * Doanh thu theo từng khách trong kỳ — tab "Theo khách" của khối Hiệu suất kinh doanh
 * (`BusinessPerformanceCard`).
 *
 * **Cơ sở là TIỀN THẬT ĐÃ THU**, không phải giá trị đơn đã chốt — cùng phép tính với thẻ "Doanh
 * thu" ngay phía trên, nên tổng các dòng cộng với phần chưa gắn khách ra đúng con số đó. Sổ khách
 * có một số khác ("Tổng giá trị thuê") tính trên đơn: đó là bề mặt đi ĐÒI NỢ và nó phải tính trên
 * đơn. Hai câu hỏi khác nhau nên hai con số.
 *
 * Không có cột "còn nợ": công nợ là số TẠI THỜI ĐIỂM NÀY còn bảng này là của một KỲ.
 *
 * SĐT + ảnh chỉ có khi người xem có quyền xem khách hàng — SERVER để trống chúng khi thiếu
 * `customer.view` (chốt 04/11/2026); dòng phụ khi đó vắng hẳn, không phải "—".
 *
 * Dùng chung stylesheet với bảng theo xe: hai tab của cùng một thẻ phải trông y hệt nhau.
 */
export function CustomerRevenueTable({
  items,
  meta,
  unassignedRevenue,
  loading,
  error,
  onChange,
}: CustomerRevenueTableProps) {
  const t = useTranslations('Finance.overview.customers');
  const fmt = useAppFormat();
  const { has } = usePermissions();

  const canOpenCustomer = has(PERMISSION.CUSTOMER_VIEW);

  /**
   * Tỷ trọng do SERVER tính trên Decimal, mẫu số là doanh thu cả kỳ (kể cả phần chưa gắn khách).
   * Không tự chia ở đây: tiền là chuỗi và `Number(a)/Number(b)` là đúng thứ ADR 0007 cấm — mà lấy
   * tổng của TRANG làm mẫu số còn tệ hơn, vì nó cho ra bộ % cộng tròn 100% ở mọi trang.
   */
  const shareLabel = (value: number | null | undefined) =>
    value == null ? '-' : t('share', { value });

  const identity = (row: CustomerRevenue) => (
    <EntityIdentity
      kind="person"
      size="sm"
      imageUrl={row.avatarUrl}
      name={row.fullName}
      subtitle={row.phone ?? undefined}
    />
  );

  const columns: DataTableColumn<CustomerRevenue>[] = [
    {
      title: t('columns.index'),
      key: 'index',
      width: 72,
      align: 'center',
      render: (_v, _row, index) => rowNumberOf(meta, index),
    },
    {
      title: t('columns.customer'),
      dataIndex: 'fullName',
      width: 420,
      render: (_v, row) =>
        canOpenCustomer ? (
          <Link href={customerPath.detail(row.tenantCustomerId)}>{identity(row)}</Link>
        ) : (
          identity(row)
        ),
    },
    {
      title: t('columns.trips'),
      dataIndex: 'trips',
      width: 160,
      render: (_v, row) => fmt.count(row.trips),
    },
    {
      title: t('columns.revenue'),
      dataIndex: 'revenue',
      width: 260,
      render: (_v, row) => <span className={styles.money}>{fmt.money(row.revenue)}</span>,
    },
    {
      title: t('columns.share'),
      dataIndex: 'sharePercent',
      width: 160,
      render: (_v, row) => shareLabel(row.sharePercent),
    },
  ];

  return (
    <div className={styles.block}>
      <DataTable
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.tenantCustomerId}
        minWidth={880}
        loading={loading}
        error={error ? { title: t('error'), onRetry: error.onRetry } : null}
        empty={{ title: t('empty'), description: t('emptyHint') }}
        renderCard={(row) => (
          <div className={styles.card}>
            {identity(row)}
            <div className={styles.cardMoney}>
              <span className={styles.moneyStrong}>{fmt.money(row.revenue)}</span>
              <span className={styles.cardMeta}>
                {t('cardLine', { trips: row.trips, share: shareLabel(row.sharePercent) })}
              </span>
            </div>
          </div>
        )}
        pagination={{
          meta,
          onChange: (page, pageSize) => onChange({ customerPage: page, customerLimit: pageSize }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      {/*
        Doanh thu không gắn khách nào — phiếu thu tay không liên kết đơn. Cùng lý do với chi phí
        chung ở bảng theo xe: thiếu dòng này thì tổng các dòng nhỏ hơn thẻ "Doanh thu" phía trên
        và người dùng đi tìm mãi phần chênh.
      */}
      {unassignedRevenue && !isZeroMoney(unassignedRevenue) ? (
        <p className={styles.footnote}>{t('unassigned', { value: fmt.money(unassignedRevenue) })}</p>
      ) : null}
    </div>
  );
}
