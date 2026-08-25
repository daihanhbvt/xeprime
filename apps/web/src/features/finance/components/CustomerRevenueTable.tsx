'use client';

import { Select } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  CUSTOMER_REVENUE_SORT_VALUES,
  PERMISSION,
  type PaginationMeta,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { customerPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { isZeroMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { CustomerRevenue, FinanceOverviewFilters } from '../types';
import styles from './VehicleProfitTable.module.css';

interface CustomerRevenueTableProps {
  items: CustomerRevenue[];
  meta: PaginationMeta;
  /** Doanh thu trong kỳ KHÔNG gắn khách nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedRevenue: string | undefined;
  /** Giá trị sắp xếp đang bật, đọc từ URL. */
  sort: string | undefined;
  loading: boolean;
  error: { onRetry: () => void } | null;
  onChange: (patch: Partial<FinanceOverviewFilters>) => void;
}

/**
 * Doanh thu theo từng khách trong kỳ.
 *
 * **Cơ sở là TIỀN THẬT ĐÃ THU**, không phải giá trị đơn đã chốt — cùng phép tính với thẻ "Doanh
 * thu" ngay phía trên, nên tổng các dòng cộng với phần chưa gắn khách ra đúng con số đó. Sổ khách
 * có một số khác ("Tổng giá trị thuê") tính trên đơn: đó là bề mặt đi ĐÒI NỢ và nó phải tính trên
 * đơn. Hai câu hỏi khác nhau nên hai con số.
 *
 * Không có cột "còn nợ": công nợ là số TẠI THỜI ĐIỂM NÀY còn bảng này là của một KỲ. Trộn hai đơn
 * vị thời gian vào một bảng là mời người đọc so hai thứ không so được — `/manage/debts` mới là chỗ
 * trả lời "ai đang nợ tôi".
 *
 * Dùng chung stylesheet với bảng hiệu quả theo xe: hai bảng đứng cạnh nhau trên cùng một trang thì
 * phải trông y hệt nhau, và cách chắc chắn nhất là chúng đọc cùng một file style.
 */
export function CustomerRevenueTable({
  items,
  meta,
  unassignedRevenue,
  sort,
  loading,
  error,
  onChange,
}: CustomerRevenueTableProps) {
  const t = useTranslations('Finance.overview.customers');
  const fmt = useAppFormat();
  const { has } = usePermissions();

  const canOpenCustomer = has(PERMISSION.CUSTOMER_VIEW);

  const sortOptions = useMemo(
    () => CUSTOMER_REVENUE_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    [t],
  );

  /**
   * Tỷ trọng do SERVER tính trên Decimal, mẫu số là doanh thu cả kỳ (kể cả phần chưa gắn khách).
   * Không tự chia ở đây: tiền là chuỗi và `Number(a)/Number(b)` là đúng thứ ADR 0007 cấm — mà lấy
   * tổng của TRANG làm mẫu số còn tệ hơn, vì nó cho ra bộ % cộng tròn 100% ở mọi trang.
   */
  const shareLabel = (value: number | null | undefined) =>
    value == null ? '—' : t('share', { value });

  const columns: DataTableColumn<CustomerRevenue>[] = [
    {
      title: t('columns.customer'),
      dataIndex: 'fullName',
      width: 260,
      render: (_v, row) =>
        canOpenCustomer ? (
          <Link href={customerPath.detail(row.tenantCustomerId)}>
            <EntityIdentity kind="person" name={row.fullName} />
          </Link>
        ) : (
          <EntityIdentity kind="person" name={row.fullName} />
        ),
    },
    {
      title: t('columns.trips'),
      dataIndex: 'trips',
      align: 'right',
      width: 96,
      render: (_v, row) => fmt.count(row.trips),
    },
    {
      title: t('columns.revenue'),
      dataIndex: 'revenue',
      align: 'right',
      width: 170,
      render: (_v, row) => <span className={styles.moneyStrong}>{fmt.money(row.revenue)}</span>,
    },
    {
      title: t('columns.share'),
      dataIndex: 'sharePercent',
      align: 'right',
      width: 100,
      render: (_v, row) => shareLabel(row.sharePercent),
    },
  ];

  return (
    // Không đặt `aria-label` ở section: `DataTable` đã dựng một vùng mang đúng tên này.
    <section className={styles.block}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('title')}</h2>
        <label className={styles.sort}>
          <span className={styles.sortLabel}>{t('sort.label')}</span>
          <Select
            size="small"
            value={sort ?? CUSTOMER_REVENUE_SORT_VALUES[0]}
            options={sortOptions}
            onChange={(value) => onChange({ customerSort: value, customerPage: 1 })}
            popupMatchSelectWidth={false}
          />
        </label>
      </div>

      <DataTable
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.tenantCustomerId}
        minWidth={640}
        loading={loading}
        error={error ? { title: t('error'), onRetry: error.onRetry } : null}
        empty={{ title: t('empty'), description: t('emptyHint') }}
        renderCard={(row) => (
          <div className={styles.card}>
            <EntityIdentity kind="person" name={row.fullName} />
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
          onChange: (page, pageSize) =>
            onChange({ customerPage: page, customerLimit: pageSize }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      {/*
        Doanh thu không gắn khách nào — phiếu thu tay không liên kết đơn. Cùng lý do với chi phí
        chung ở bảng theo xe: thiếu dòng này thì tổng các dòng nhỏ hơn thẻ "Doanh thu" phía trên
        và người dùng đi tìm mãi phần chênh.
      */}
      {unassignedRevenue && !isZeroMoney(unassignedRevenue) ? (
        <p className={styles.footnote}>
          {t('unassigned', { value: fmt.money(unassignedRevenue) })}
        </p>
      ) : null}
    </section>
  );
}
