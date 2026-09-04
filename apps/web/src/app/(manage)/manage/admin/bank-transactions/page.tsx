'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BANK_MATCH_STATUS,
  BANK_MATCH_STATUS_META,
  BANK_MATCH_STATUS_VALUES,
  type BankMatchStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { BANK_TX_DEFAULT_LIMIT } from '@/features/bank-transactions/api';
import { BankTransactionDrawer } from '@/features/bank-transactions/components/BankTransactionDrawer';
import { useBankTransactions } from '@/features/bank-transactions/hooks/use-bank-transactions';
import type { BankTransaction, BankTransactionFilters } from '@/features/bank-transactions/types';
import styles from './page.module.css';

const MIN_TABLE_WIDTH = 900;

/**
 * Hàng đợi đối soát tiền vào của admin nền tảng (R2 mục 4 — ADR 0022 điều 4).
 *
 * Đây là đường để một khoản tiền "về mà khách quên ghi mã" trở thành một gói được mở **mà không
 * ai phải sửa database** — chính điều kiện của gate R2. Mặc định chỉ hiện khoản CHƯA KHỚP: màn
 * này là việc-cần-làm, không phải sổ lịch sử (lịch sử vẫn xem được qua bộ lọc trạng thái).
 *
 * Bảo vệ thật nằm ở server (`@PlatformOnly` + `platform.billing.manage`); trang này không tự
 * kiểm quyền, nó chỉ có mặt trong menu khi vai có quyền đó.
 */
export default function AdminBankTransactionsPage() {
  const t = useTranslations('BankTransactions');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const [filters, setFilters] = useState<BankTransactionFilters>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isError, isFetching, refetch } = useBankTransactions(filters);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: BANK_TX_DEFAULT_LIMIT, total: 0, hasNext: false };

  function patch(next: Partial<BankTransactionFilters>) {
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
      key: 'matchStatus',
      label: t('filters.status'),
      options: BANK_MATCH_STATUS_VALUES.map((status) => ({
        value: status,
        label: domainLabel('bankMatchStatus', status),
      })),
      allowClear: true,
    },
  ];

  const columns: DataTableColumn<BankTransaction>[] = [
    {
      title: t('columns.amount'),
      key: 'amount',
      align: 'right',
      width: 140,
      render: (_, row) => <b className={styles.amount}>{fmt.money(row.amountIn)}</b>,
    },
    {
      title: t('columns.content'),
      key: 'content',
      render: (_, row) => <span className={styles.content}>{row.content}</span>,
    },
    {
      title: t('columns.code'),
      key: 'code',
      width: 140,
      render: (_, row) =>
        row.referenceCode ? (
          <span className={styles.code}>{row.referenceCode}</span>
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.matchStatus as BankMatchStatus}
          meta={BANK_MATCH_STATUS_META}
          group="bankMatchStatus"
        />
      ),
    },
    {
      title: t('columns.bankTime'),
      key: 'bankTime',
      width: 160,
      render: (_, row) => (row.bankTime ? fmt.dateTime(row.bankTime) : fmt.dateTime(row.createdAt)),
    },
    {
      title: t('columns.handledBy'),
      key: 'handledBy',
      width: 160,
      render: (_, row) => row.matchedByName ?? tCommon('labels.emptyValue'),
    },
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />
      <p className={styles.subtitle}>{t('page.subtitle')}</p>

      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, matchStatus: filters.matchStatus ?? BANK_MATCH_STATUS.UNMATCHED }}
        onChange={(next) => patch({ q: next.q, matchStatus: next.matchStatus })}
      />

      <DataTable<BankTransaction>
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

      <BankTransactionDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
