'use client';

import { RightOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import {
  BANK_MATCH_STATUS,
  BANK_MATCH_STATUS_META,
  BANK_MATCH_STATUS_VALUES,
  BANK_TX_CODE_FILTER,
  BANK_TX_CODE_FILTER_VALUES,
  isBankMatchStatus,
  type BankMatchStatus,
  type BankTxCodeFilter,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { DAY_PARAM_FORMAT, dayjs } from '@/lib/datetime';
import { QueueViewSwitch } from '@/features/platform-money/components/QueueViewSwitch';
import { WaitingAgeText } from '@/features/platform-money/components/WaitingAgeText';
import { isUrgentWait, waitingAge } from '@/features/platform-money/waiting-age';
import { BANK_TX_DEFAULT_LIMIT } from '../api';
import { useBankTransactions } from '../hooks/use-bank-transactions';
import type { BankTransaction } from '../types';
import { BankTransactionDrawer } from './BankTransactionDrawer';
import styles from './BankInQueue.module.css';

const MIN_TABLE_WIDTH = 880;

interface BankInUrlFilters {
  q?: string;
  /** Trạng thái khớp; vắng = CHƯA KHỚP (mặc định của hàng đợi). */
  status?: BankMatchStatus;
  code?: BankTxCodeFilter;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  /** Giao dịch đang mở ở panel chi tiết — trên URL để link tới đúng một khoản. */
  open?: string;
}

function isDayParam(value: string | null): value is string {
  return Boolean(value) && dayjs(value, DAY_PARAM_FORMAT, true).isValid();
}

/** Lúc tiền tới — theo NGÂN HÀNG; dòng thiếu mốc đó (payload cũ) lấy lúc webhook về. */
function arrivedAt(row: BankTransaction): string {
  return row.bankTime ?? row.createdAt;
}

function parse(params: URLSearchParams): BankInUrlFilters {
  const status = params.get('status');
  const code = params.get('code');
  const from = params.get('from');
  const to = params.get('to');
  return {
    q: params.get('q')?.trim() || undefined,
    status:
      isBankMatchStatus(status) && status !== BANK_MATCH_STATUS.UNMATCHED ? status : undefined,
    code: (BANK_TX_CODE_FILTER_VALUES as string[]).includes(code ?? '')
      ? (code as BankTxCodeFilter)
      : undefined,
    from: isDayParam(from) ? from : undefined,
    to: isDayParam(to) ? to : undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    open: params.get('open') || undefined,
  };
}

/**
 * Hàng đợi TIỀN VÀO CHƯA KHỚP của màn Tài chính — ADR 0022 điều 4.
 *
 * Đây là đường để một khoản "về mà khách quên ghi mã" thành một gói được mở mà không ai phải sửa
 * database. Mặc định chỉ hiện khoản CHƯA KHỚP — màn này là việc-cần-làm; lịch sử (đã khớp, khớp
 * tay, bỏ qua) vẫn xem được qua nhóm nút trạng thái.
 */
export function BankInQueue() {
  const t = useTranslations('BankTransactions');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useUrlFilters(parse);

  const status = filters.status ?? BANK_MATCH_STATUS.UNMATCHED;
  const pending = status === BANK_MATCH_STATUS.UNMATCHED;

  const { data, isError, isFetching, refetch } = useBankTransactions({
    matchStatus: filters.status,
    q: filters.q,
    code: filters.code,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    limit: filters.limit,
  });
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: BANK_TX_DEFAULT_LIMIT, total: 0, hasNext: false };
  // Trước/sau trong panel đi theo ĐÚNG thứ tự đang hiện trên trang (cùng cách màn duyệt xe làm).
  const openIndex = filters.open ? items.findIndex((row) => row.id === filters.open) : -1;

  const codeLabel: Record<BankTxCodeFilter, string> = {
    [BANK_TX_CODE_FILTER.SUBSCRIPTION_INVOICE]: t('code.subscription_invoice'),
    [BANK_TX_CODE_FILTER.BOOKING_HOLD]: t('code.booking_hold'),
    [BANK_TX_CODE_FILTER.NO_CODE]: t('code.no_code'),
  };

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: t('filters.bankTime') },
    {
      kind: 'select',
      key: 'code',
      label: t('filters.code'),
      allowClear: true,
      options: BANK_TX_CODE_FILTER_VALUES.map((value) => ({ value, label: codeLabel[value] })),
    },
  ];

  const columns: DataTableColumn<BankTransaction>[] = [
    {
      title: t('columns.amount'),
      key: 'amount',
      align: 'right',
      width: 128,
      render: (_, row) => <span className={styles.amount}>{fmt.money(row.amountIn)}</span>,
    },
    {
      title: t('columns.content'),
      key: 'content',
      render: (_, row) => <span className={styles.content}>{row.content}</span>,
    },
    {
      title: t('columns.code'),
      key: 'code',
      width: 132,
      render: (_, row) =>
        row.referenceCode ? (
          <span className={styles.code}>{row.referenceCode}</span>
        ) : (
          <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
        ),
    },
    pending
      ? {
          title: t('columns.waited'),
          key: 'waited',
          width: 92,
          render: (_, row) => {
            const age = waitingAge(arrivedAt(row));
            return <WaitingAgeText age={age} urgent={isUrgentWait(age)} />;
          },
        }
      : {
          title: t('columns.handledAt'),
          key: 'handledAt',
          width: 140,
          render: (_, row) =>
            row.matchedAt ? fmt.dateTime(row.matchedAt) : tCommon('labels.emptyValue'),
        },
    {
      title: t('columns.bankTime'),
      key: 'bankTime',
      width: 140,
      render: (_, row) => <span className={styles.nowrap}>{fmt.dateTime(arrivedAt(row))}</span>,
    },
    {
      title: t('columns.handledBy'),
      key: 'handledBy',
      width: 120,
      render: (_, row) =>
        row.matchedByName ??
        (row.matchStatus === BANK_MATCH_STATUS.MATCHED ? (
          <span className={styles.muted}>{t('columns.auto')}</span>
        ) : (
          <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
        )),
    },
    {
      title: '',
      key: 'open',
      width: 36,
      align: 'right',
      render: () => <RightOutlined className={styles.chevron} aria-hidden />,
    },
  ];

  /** Thẻ riêng cho điện thoại — số tiền và đã chờ bao lâu là hai thứ người trực nhìn đầu tiên. */
  function renderCard(row: BankTransaction) {
    const age = waitingAge(arrivedAt(row));
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.amount}>{fmt.money(row.amountIn)}</span>
          {pending ? (
            <WaitingAgeText age={age} urgent={isUrgentWait(age)} />
          ) : (
            <StatusTag
              value={row.matchStatus as BankMatchStatus}
              meta={BANK_MATCH_STATUS_META}
              group="bankMatchStatus"
            />
          )}
        </div>
        <p className={styles.cardContent}>{row.content}</p>
        <div className={styles.cardMeta}>
          {row.referenceCode ? <span className={styles.code}>{row.referenceCode}</span> : null}
          <span>{fmt.dateTime(arrivedAt(row))}</span>
          <RightOutlined className={styles.chevron} aria-hidden />
        </div>
      </div>
    );
  }

  const filtered = Boolean(
    filters.q || filters.code || filters.from || filters.to || filters.status,
  );

  return (
    <>
      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          from: filters.from,
          to: filters.to,
          code: filters.code,
        }}
        // `FilterBar` gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá đó. Dựng lại cả bộ từ bản vá là
        // xoá mất các bộ lọc kia: chọn mã thì mất khoảng ngày, gõ tìm thì mất mã.
        onChange={(patch) => setFilters(patch as Partial<BankInUrlFilters>)}
        onClear={() =>
          setFilters({ q: undefined, from: undefined, to: undefined, code: undefined })
        }
      />

      {/*
        Trạng thái đứng RIÊNG một hàng, ngoài thanh lọc: nó là bốn GÓC NHÌN của cùng một sổ (việc
        cần làm ↔ lịch sử), không phải một bộ lọc — để trong thanh lọc thì nút "Xoá bộ lọc" sáng
        ngay cả khi người dùng chưa lọc gì.
      */}
      <QueueViewSwitch<BankMatchStatus>
        label={t('filters.status')}
        value={status}
        onChange={(value) =>
          // Chưa khớp là mặc định — không ghi lên URL.
          setFilters({ status: value === BANK_MATCH_STATUS.UNMATCHED ? undefined : value })
        }
        options={BANK_MATCH_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('bankMatchStatus', value),
        }))}
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
        filtered={filtered}
        empty={{ title: t('page.empty'), description: t('page.emptyDescription') }}
        noResults={{ title: tCommon('states.noResults') }}
        onRowClick={(row) => setFilters({ open: row.id }, { resetPage: false })}
        selectedRowKey={filters.open ?? null}
        renderCard={renderCard}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

      <BankTransactionDrawer
        id={filters.open ?? null}
        previousId={openIndex > 0 ? items[openIndex - 1]!.id : null}
        nextId={openIndex >= 0 && openIndex < items.length - 1 ? items[openIndex + 1]!.id : null}
        onNavigate={(id) => setFilters({ open: id }, { resetPage: false })}
        onClose={() => setFilters({ open: undefined }, { resetPage: false })}
      />
    </>
  );
}
