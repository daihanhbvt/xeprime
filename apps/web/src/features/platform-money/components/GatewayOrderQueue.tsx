'use client';

import { RightOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import {
  PAYMENT_GATEWAY_PROVIDER_VALUES,
  PAYMENT_ORDER_QUEUE_VIEW,
  PAYMENT_ORDER_QUEUE_VIEW_VALUES,
  PAYMENT_ORDER_STATUS_META,
  PAYMENT_ORDER_STATUS_VALUES,
  PAYMENT_ORDER_TARGET_VALUES,
  isPaymentGatewayProvider,
  isPaymentOrderQueueView,
  isPaymentOrderStatus,
  isPaymentOrderTarget,
  type PaymentGatewayProvider,
  type PaymentOrderQueueView,
  type PaymentOrderStatus,
  type PaymentOrderTarget,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { MONEY_DEFAULT_LIMIT } from '../api';
import { useGatewayOrders } from '../hooks/use-gateway-orders';
import type { PlatformPaymentOrder } from '../types';
import { isUrgentWait, waitingAge } from '../waiting-age';
import { GatewayOrderDrawer } from './GatewayOrderDrawer';
import { QueueViewSwitch } from './QueueViewSwitch';
import { WaitingAgeText } from './WaitingAgeText';
import styles from './GatewayOrderQueue.module.css';

const MIN_TABLE_WIDTH = 960;

interface GatewayUrlFilters {
  /** Góc nhìn; vắng = CẦN XỬ LÝ (mặc định của hàng đợi). */
  view?: PaymentOrderQueueView;
  provider?: PaymentGatewayProvider;
  target?: PaymentOrderTarget;
  status?: PaymentOrderStatus;
  q?: string;
  page?: number;
  limit?: number;
  /** Lượt đang mở ở panel chi tiết — trên URL để link tới đúng một lượt. */
  open?: string;
}

function parse(params: URLSearchParams): GatewayUrlFilters {
  const view = params.get('view');
  const provider = params.get('provider');
  const target = params.get('target');
  const status = params.get('status');
  return {
    view: isPaymentOrderQueueView(view) && view !== PAYMENT_ORDER_QUEUE_VIEW.REVIEW ? view : undefined,
    provider: isPaymentGatewayProvider(provider) ? provider : undefined,
    target: isPaymentOrderTarget(target) ? target : undefined,
    status: isPaymentOrderStatus(status) ? status : undefined,
    q: params.get('q')?.trim() || undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    open: params.get('open') || undefined,
  };
}

/**
 * Hàng đợi LƯỢT THANH TOÁN QUA CỔNG của màn Tài chính — ADR 0058.
 *
 * Mặc định chỉ hiện lượt CẦN NGƯỜI XỬ LÝ (cổng báo về mà hệ thống không tự ghi nhận được: tiền về
 * muộn, lệch số tiền, ghi nhận lỗi…), cũ nhất trước. Lịch sử mọi lượt vẫn xem được qua nhóm góc
 * nhìn — nó là một GÓC NHÌN, không phải một bộ lọc, nên đứng ngoài thanh lọc.
 */
export function GatewayOrderQueue() {
  const t = useTranslations('PlatformMoney.gateway');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useUrlFilters(parse);

  const view = filters.view ?? PAYMENT_ORDER_QUEUE_VIEW.REVIEW;
  const reviewing = view === PAYMENT_ORDER_QUEUE_VIEW.REVIEW;

  const { data, isError, isFetching, refetch } = useGatewayOrders({
    view,
    provider: filters.provider,
    target: filters.target,
    status: filters.status,
    q: filters.q,
    page: filters.page,
    limit: filters.limit,
  });
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MONEY_DEFAULT_LIMIT, total: 0, hasNext: false };
  const openIndex = filters.open ? items.findIndex((row) => row.id === filters.open) : -1;

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'provider',
      label: t('filters.provider'),
      allowClear: true,
      options: PAYMENT_GATEWAY_PROVIDER_VALUES.map((value) => ({
        value,
        label: domainLabel('paymentGatewayProvider', value),
      })),
    },
    {
      kind: 'select',
      key: 'target',
      label: t('filters.target'),
      allowClear: true,
      options: PAYMENT_ORDER_TARGET_VALUES.map((value) => ({
        value,
        label: domainLabel('paymentOrderTarget', value),
      })),
    },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      allowClear: true,
      options: PAYMENT_ORDER_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('paymentOrderStatus', value),
      })),
    },
  ];

  const columns: DataTableColumn<PlatformPaymentOrder>[] = [
    {
      title: t('columns.amount'),
      key: 'amount',
      align: 'right',
      width: 128,
      render: (_, row) => <span className={styles.amount}>{fmt.money(row.amount)}</span>,
    },
    {
      title: t('columns.provider'),
      key: 'provider',
      width: 110,
      render: (_, row) => domainLabel('paymentGatewayProvider', row.provider),
    },
    {
      title: t('columns.code'),
      key: 'code',
      width: 170,
      render: (_, row) => (
        <span className={styles.codeCell}>
          <span className={styles.code}>{row.targetCode}</span>
          <span className={styles.muted}>{domainLabel('paymentOrderTarget', row.targetType)}</span>
        </span>
      ),
    },
    {
      title: t('columns.tenant'),
      key: 'tenant',
      render: (_, row) => <span className={styles.tenant}>{row.tenantName}</span>,
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as PaymentOrderStatus}
          meta={PAYMENT_ORDER_STATUS_META}
          group="paymentOrderStatus"
        />
      ),
    },
    reviewing
      ? {
          title: t('columns.reason'),
          key: 'reason',
          render: (_, row) =>
            row.reviewReason ? domainLabel('paymentOrderReviewReason', row.reviewReason) : null,
        }
      : {
          title: t('columns.outcome'),
          key: 'outcome',
          width: 150,
          render: (_, row) =>
            row.applyOutcome ? (
              domainLabel('paymentOrderApplyOutcome', row.applyOutcome)
            ) : (
              <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
            ),
        },
    reviewing
      ? {
          title: t('columns.waited'),
          key: 'waited',
          width: 92,
          render: (_, row) => {
            const age = waitingAge(row.resultAt ?? row.createdAt);
            return <WaitingAgeText age={age} urgent={isUrgentWait(age)} />;
          },
        }
      : {
          title: t('columns.createdAt'),
          key: 'createdAt',
          width: 140,
          render: (_, row) => <span className={styles.nowrap}>{fmt.dateTime(row.createdAt)}</span>,
        },
    {
      title: '',
      key: 'open',
      width: 36,
      align: 'right',
      render: () => <RightOutlined className={styles.chevron} aria-hidden />,
    },
  ];

  /** Thẻ cho điện thoại — số tiền, cổng và lý do là ba thứ người trực nhìn đầu tiên. */
  function renderCard(row: PlatformPaymentOrder) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.amount}>{fmt.money(row.amount)}</span>
          <StatusTag
            value={row.status as PaymentOrderStatus}
            meta={PAYMENT_ORDER_STATUS_META}
            group="paymentOrderStatus"
          />
        </div>
        <p className={styles.cardContent}>
          {domainLabel('paymentGatewayProvider', row.provider)} · {row.tenantName}
        </p>
        {row.reviewReason ? (
          <p className={styles.cardContent}>
            {domainLabel('paymentOrderReviewReason', row.reviewReason)}
          </p>
        ) : null}
        <div className={styles.cardMeta}>
          <span className={styles.code}>{row.targetCode}</span>
          <span>{fmt.dateTime(row.createdAt)}</span>
          <RightOutlined className={styles.chevron} aria-hidden />
        </div>
      </div>
    );
  }

  const filtered = Boolean(filters.q || filters.provider || filters.target || filters.status);

  return (
    <>
      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          provider: filters.provider,
          target: filters.target,
          status: filters.status,
        }}
        // `FilterBar` gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá đó, không dựng lại cả bộ.
        onChange={(patch) => setFilters(patch as Partial<GatewayUrlFilters>)}
        onClear={() =>
          setFilters({ q: undefined, provider: undefined, target: undefined, status: undefined })
        }
      />

      <QueueViewSwitch<PaymentOrderQueueView>
        label={t('filters.view')}
        value={view}
        onChange={(value) =>
          // Cần xử lý là mặc định — không ghi lên URL.
          setFilters({ view: value === PAYMENT_ORDER_QUEUE_VIEW.REVIEW ? undefined : value })
        }
        options={PAYMENT_ORDER_QUEUE_VIEW_VALUES.map((value) => ({
          value,
          label: domainLabel('paymentOrderQueueView', value),
        }))}
      />

      <DataTable<PlatformPaymentOrder>
        label={t('tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        filtered={filtered}
        empty={{ title: t('empty'), description: t('emptyDescription') }}
        noResults={{ title: tCommon('states.noResults') }}
        onRowClick={(row) => setFilters({ open: row.id }, { resetPage: false })}
        selectedRowKey={filters.open ?? null}
        renderCard={renderCard}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      <GatewayOrderDrawer
        id={filters.open ?? null}
        previousId={openIndex > 0 ? items[openIndex - 1]!.id : null}
        nextId={openIndex >= 0 && openIndex < items.length - 1 ? items[openIndex + 1]!.id : null}
        onNavigate={(id) => setFilters({ open: id }, { resetPage: false })}
        onClose={() => setFilters({ open: undefined }, { resetPage: false })}
      />
    </>
  );
}
