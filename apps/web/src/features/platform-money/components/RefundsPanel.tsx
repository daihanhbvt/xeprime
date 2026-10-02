'use client';

import { App } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  HOLD_REFUND_STATUS,
  HOLD_REFUND_STATUS_META,
  HOLD_REFUND_STATUS_VALUES,
  isHoldRefundStatus,
  type HoldRefundStatus,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { MONEY_DEFAULT_LIMIT } from '../api';
import { useRefunds, useRejectRefund } from '../hooks/use-platform-money';
import type { PlatformHoldRefund } from '../types';
import { QueueViewSwitch } from './QueueViewSwitch';
import { RefundPaidModal } from './RefundPaidModal';
import styles from './MoneyQueue.module.css';

const MIN_TABLE_WIDTH = 1080;
/** Cùng sàn với `RejectRefundDto` — khách đọc lý do này, nên một chữ "ko" là không đủ. */
const REJECT_NOTE_MIN = 5;

interface RefundUrlFilters {
  /** Vắng = CHỜ CHUYỂN (mặc định của hàng đợi). */
  status?: HoldRefundStatus;
  page?: number;
  limit?: number;
}

function parse(params: URLSearchParams): RefundUrlFilters {
  const status = params.get('status');
  return {
    status:
      isHoldRefundStatus(status) && status !== HOLD_REFUND_STATUS.PENDING ? status : undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
  };
}

/** Hàng đợi CHUYỂN TRẢ khoản giữ chỗ — mặc định chỉ khoản CHỜ CHUYỂN, cũ nhất trước. */
export function RefundsPanel() {
  const t = useTranslations('PlatformMoney');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { filters, setFilters } = useUrlFilters(parse);

  const [paying, setPaying] = useState<PlatformHoldRefund | null>(null);
  const [rejecting, setRejecting] = useState<PlatformHoldRefund | null>(null);

  const status = filters.status ?? HOLD_REFUND_STATUS.PENDING;
  const { data, isError, isFetching, refetch } = useRefunds({
    status,
    page: filters.page,
    limit: filters.limit,
  });
  const rejectMutation = useRejectRefund();
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MONEY_DEFAULT_LIMIT, total: 0, hasNext: false };

  const columns: DataTableColumn<PlatformHoldRefund>[] = [
    {
      title: t('columns.code'),
      key: 'code',
      width: 150,
      render: (_, row) => <span className={styles.mono}>{row.holdCode}</span>,
    },
    {
      title: t('columns.payee'),
      key: 'payee',
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.strong}>{row.customerName}</span>
          <span className={styles.secondary}>{row.tenantName}</span>
        </div>
      ),
    },
    {
      title: t('columns.amount'),
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, row) => <span className={styles.amount}>{fmt.money(row.amount)}</span>,
    },
    {
      title: t('columns.reason'),
      key: 'reason',
      width: 200,
      render: (_, row) => domainLabel('holdRefundReason', row.reason),
    },
    {
      title: t('refundPaid.account'),
      key: 'account',
      width: 220,
      render: (_, row) =>
        row.bankCode && row.bankAccountNumber ? (
          <div className={styles.stack}>
            <span className={styles.inlineCode}>
              <span className={styles.mono}>
                {row.bankCode} · {row.bankAccountNumber}
              </span>
              <CopyButton value={row.bankAccountNumber} label={t('refundPaid.account')} />
            </span>
            {row.bankAccountName ? (
              <span className={styles.secondary}>{row.bankAccountName}</span>
            ) : null}
          </div>
        ) : (
          <span className={styles.muted}>{t('columns.noAccount')}</span>
        ),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as HoldRefundStatus}
          meta={HOLD_REFUND_STATUS_META}
          group="holdRefundStatus"
        />
      ),
    },
    {
      title: t('columns.createdAt'),
      key: 'createdAt',
      width: 150,
      render: (_, row) => fmt.dateTime(row.createdAt),
    },
    actionColumn<PlatformHoldRefund>(
      (row) => [
        {
          key: 'paid',
          label: t('columns.markPaidAction'),
          hidden: row.status !== HOLD_REFUND_STATUS.PENDING,
          onClick: () => setPaying(row),
        },
        {
          key: 'reject',
          label: t('columns.rejectAction'),
          danger: true,
          hidden: row.status !== HOLD_REFUND_STATUS.PENDING,
          onClick: () => setRejecting(row),
        },
      ],
      { width: 200, maxInline: 2 },
    ),
  ];

  return (
    <>
      <QueueViewSwitch<HoldRefundStatus>
        label={t('filters.status')}
        value={status}
        options={HOLD_REFUND_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('holdRefundStatus', value),
        }))}
        // Chờ chuyển là mặc định — không ghi lên URL.
        onChange={(next) =>
          setFilters({ status: next === HOLD_REFUND_STATUS.PENDING ? undefined : next })
        }
      />

      <DataTable<PlatformHoldRefund>
        label={t('queues.refunds')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        filtered={Boolean(filters.status)}
        empty={{ title: t('page.refundsEmpty') }}
        noResults={{ title: tCommon('states.noResults') }}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('page.refundsTotal', { count: total }),
        }}
      />

      <RefundPaidModal refund={paying} onClose={() => setPaying(null)} />

      <ReasonDialog
        open={rejecting !== null}
        title={t('reject.title')}
        audienceHint={t('reject.audienceHint')}
        label={t('reject.noteLabel')}
        placeholder={t('reject.notePlaceholder')}
        requiredMessage={t('reject.noteRequired')}
        minLength={REJECT_NOTE_MIN}
        maxLength={1000}
        submitText={t('reject.submit')}
        loading={rejectMutation.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={(note) => {
          if (!rejecting) return;
          rejectMutation.mutate(
            { id: rejecting.id, note },
            {
              onSuccess: () => {
                message.success(t('reject.success'));
                setRejecting(null);
              },
              onError: (err) => message.error(errorMessage(err)),
            },
          );
        }}
      />
    </>
  );
}
