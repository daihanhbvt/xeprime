'use client';

import { App, Alert, Button, DatePicker, Descriptions, Input, Skeleton, Tabs, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_HOLD_OUTCOME_META,
  BOOKING_HOLD_STATUS,
  BOOKING_HOLD_STATUS_META,
  BOOKING_HOLD_STATUS_VALUES,
  HOLD_REFUND_STATUS,
  HOLD_REFUND_STATUS_META,
  HOLD_REFUND_STATUS_VALUES,
  type BookingHoldOutcome,
  type BookingHoldStatus,
  type HoldRefundStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { DAY_PARAM_FORMAT, dayjs, nowInAppTz } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { MONEY_DEFAULT_LIMIT } from '../api';
import {
  useDailyReconciliation,
  useHolds,
  useRefunds,
  useRejectRefund,
} from '../hooks/use-platform-money';
import type { HoldFilters, PlatformHold, PlatformHoldRefund, RefundFilters } from '../types';
import { RefundPaidModal } from './RefundPaidModal';
import { SettleHoldModal } from './SettleHoldModal';
import styles from './MoneyOperationsView.module.css';

const MIN_TABLE_WIDTH = 1080;

/**
 * MONEY OPERATIONS của nền tảng — Gap Analysis §3.B, ADR 0028 release gate 6–7 (R3).
 *
 * Ba tab là ba câu hỏi khác nhau và cố ý KHÔNG gộp: "khoản nào đang chờ chốt", "khoản nào phải
 * chuyển trả", "hôm nay tiền vào có khớp sổ không". Gộp lại thành một bảng là mất câu thứ ba —
 * đối chiếu là phép cộng trên CẢ ngày, không phải một dòng.
 */
export function MoneyOperationsView() {
  const t = useTranslations('PlatformMoney');

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      <Tabs
        items={[
          { key: 'holds', label: t('tabs.holds'), children: <HoldsPanel /> },
          { key: 'refunds', label: t('tabs.refunds'), children: <RefundsPanel /> },
          { key: 'reconciliation', label: t('tabs.reconciliation'), children: <ReconciliationPanel /> },
        ]}
      />
    </div>
  );
}

/** Hàng đợi khoản giữ chỗ — mặc định chỉ khoản ĐÃ TRẢ mà chưa chốt kết cục. */
function HoldsPanel() {
  const t = useTranslations('PlatformMoney');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const [filters, setFilters] = useState<HoldFilters>({ unsettled: true });
  const [settling, setSettling] = useState<PlatformHold | null>(null);

  const { data, isError, isFetching, refetch } = useHolds(filters);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MONEY_DEFAULT_LIMIT, total: 0, hasNext: false };

  function patch(next: Partial<HoldFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  /*
   * Ô lọc trạng thái CHỈ có mặt khi đang xem "tất cả".
   *
   * `unsettled=true` ở backend ép `status = paid, outcome = null` và nuốt luôn bộ lọc trạng
   * thái. Để ô đó đứng đấy là mời admin chọn "hết hạn" rồi tự hỏi vì sao danh sách không đổi —
   * một ô lọc không làm gì còn tệ hơn không có ô nào.
   */
  const filterFields: FilterField[] = [
    { kind: 'search', key: 'q', label: t('filters.search'), placeholder: t('filters.holdsSearchPlaceholder') },
    ...(filters.unsettled
      ? []
      : ([
          {
            kind: 'select',
            key: 'status',
            label: t('filters.status'),
            options: BOOKING_HOLD_STATUS_VALUES.map((status) => ({
              value: status,
              label: domainLabel('bookingHoldStatus', status),
            })),
            allowClear: true,
          },
        ] as FilterField[])),
    {
      kind: 'segmented',
      key: 'unsettled',
      label: t('filters.scope'),
      options: [
        { value: 'true', label: t('filters.unsettledOnly') },
        { value: 'all', label: t('filters.allHolds') },
      ],
    },
  ];

  const columns: DataTableColumn<PlatformHold>[] = [
    {
      title: t('columns.code'),
      key: 'code',
      width: 150,
      render: (_, row) => (
        <div>
          <div className={styles.code}>{row.code}</div>
          {row.disputeOpen ? <Tag color="orange">{t('columns.disputeOpen')}</Tag> : null}
        </div>
      ),
    },
    { title: t('columns.tenant'), key: 'tenant', render: (_, row) => row.tenantName },
    { title: t('columns.customer'), key: 'customer', render: (_, row) => row.customerName },
    {
      title: t('columns.amount'),
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, row) => (
        <div>
          <b>{fmt.money(row.amount)}</b>
          {row.paidAmount !== row.amount ? (
            <div>{t('columns.paidAmount', { amount: fmt.money(row.paidAmount) })}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as BookingHoldStatus}
          meta={BOOKING_HOLD_STATUS_META}
          group="bookingHoldStatus"
        />
      ),
    },
    {
      title: t('columns.outcome'),
      key: 'outcome',
      width: 160,
      render: (_, row) =>
        row.outcome ? (
          <StatusTag
            value={row.outcome as BookingHoldOutcome}
            meta={BOOKING_HOLD_OUTCOME_META}
            group="bookingHoldOutcome"
          />
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    {
      title: t('columns.createdAt'),
      key: 'createdAt',
      width: 160,
      render: (_, row) => fmt.dateTime(row.createdAt),
    },
    actionColumn<PlatformHold>(
      (row) => [
        {
          key: 'settle',
          label: t('columns.settleAction'),
          hidden: Boolean(row.outcome) || row.status !== BOOKING_HOLD_STATUS.PAID,
          onClick: () => setSettling(row),
        },
      ],
      { width: 160, maxInline: 1 },
    ),
  ];

  return (
    <>
      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          status: filters.status,
          unsettled: filters.unsettled ? 'true' : 'all',
        }}
        onChange={(next) => {
          const unsettled = next.unsettled === 'true';
          // Bật lại "chờ chốt" thì xoá luôn trạng thái đã chọn — giữ nó lại là để một bộ lọc
          // vô hiệu nằm trong URL/chip và sống dậy bất ngờ khi người dùng quay về "tất cả".
          patch({ q: next.q, status: unsettled ? undefined : next.status, unsettled });
        }}
      />

      <DataTable<PlatformHold>
        label={t('tabs.holds')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('page.holdsEmpty') }}
        pagination={{
          meta,
          onChange: (page, limit) => patch({ page, limit }),
          totalLabel: (total) => t('page.holdsTotal', { count: total }),
        }}
      />

      <SettleHoldModal hold={settling} onClose={() => setSettling(null)} />
    </>
  );
}

/** Hàng đợi chuyển trả — mặc định chỉ khoản CHỜ CHUYỂN. */
function RefundsPanel() {
  const t = useTranslations('PlatformMoney');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message, modal } = App.useApp();

  const [filters, setFilters] = useState<RefundFilters>({ status: HOLD_REFUND_STATUS.PENDING });
  const [paying, setPaying] = useState<PlatformHoldRefund | null>(null);

  const { data, isError, isFetching, refetch } = useRefunds(filters);
  const rejectMutation = useRejectRefund();
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MONEY_DEFAULT_LIMIT, total: 0, hasNext: false };

  function patch(next: Partial<RefundFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  function confirmReject(row: PlatformHoldRefund) {
    let note = '';
    modal.confirm({
      title: t('reject.title'),
      content: (
        <Input.TextArea
          rows={3}
          placeholder={t('reject.notePlaceholder')}
          aria-label={t('reject.noteLabel')}
          onChange={(e) => {
            note = e.target.value;
          }}
        />
      ),
      okText: t('reject.submit'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.cancel'),
      onOk: () =>
        new Promise<void>((resolve, rejectModal: (reason: Error) => void) => {
          if (note.trim().length < 5) {
            message.error(t('reject.noteRequired'));
            rejectModal(new Error('note-required'));
            return;
          }
          rejectMutation.mutate(
            { id: row.id, note: note.trim() },
            {
              onSuccess: () => {
                message.success(t('reject.success'));
                resolve();
              },
              onError: (err) => {
                message.error(errorMessage(err));
                rejectModal(err instanceof Error ? err : new Error('reject-failed'));
              },
            },
          );
        }),
    });
  }

  const filterFields: FilterField[] = [
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      options: HOLD_REFUND_STATUS_VALUES.map((status) => ({
        value: status,
        label: domainLabel('holdRefundStatus', status),
      })),
      allowClear: true,
    },
  ];

  const columns: DataTableColumn<PlatformHoldRefund>[] = [
    { title: t('columns.code'), key: 'code', width: 150, render: (_, row) => row.holdCode },
    { title: t('columns.tenant'), key: 'tenant', render: (_, row) => row.tenantName },
    { title: t('columns.customer'), key: 'customer', render: (_, row) => row.customerName },
    {
      title: t('columns.amount'),
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, row) => <b>{fmt.money(row.amount)}</b>,
    },
    {
      title: t('columns.reason'),
      key: 'reason',
      width: 200,
      render: (_, row) => domainLabel('holdRefundReason', row.reason),
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
      width: 160,
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
          onClick: () => confirmReject(row),
        },
      ],
      { width: 220, maxInline: 2 },
    ),
  ];

  return (
    <>
      <FilterBar
        fields={filterFields}
        values={{ status: filters.status ?? HOLD_REFUND_STATUS.PENDING }}
        onChange={(next) => patch({ status: next.status })}
      />

      <DataTable<PlatformHoldRefund>
        label={t('tabs.refunds')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('page.refundsEmpty') }}
        pagination={{
          meta,
          onChange: (page, limit) => patch({ page, limit }),
          totalLabel: (total) => t('page.refundsTotal', { count: total }),
        }}
      />

      <RefundPaidModal refund={paying} onClose={() => setPaying(null)} />
    </>
  );
}

/**
 * Đối chiếu MỘT ngày (giờ Việt Nam).
 *
 * `variance ≠ 0` là dấu hiệu có dòng tiền không thuộc nhóm nào — nó được hiện như một CẢNH BÁO
 * chứ không phải một con số bình thường trong bảng, vì đó chính là thứ cả màn này tồn tại để bắt.
 */
function ReconciliationPanel() {
  const t = useTranslations('PlatformMoney');
  const fmt = useAppFormat();

  const [date, setDate] = useState(() => nowInAppTz().format(DAY_PARAM_FORMAT));
  const { data, isLoading, isError, refetch } = useDailyReconciliation(date);

  return (
    <div className={styles.reconciliation}>
      <DatePicker
        value={dayjs(date, DAY_PARAM_FORMAT)}
        allowClear={false}
        aria-label={t('reconciliation.date')}
        onChange={(value) => {
          if (value) setDate(value.format(DAY_PARAM_FORMAT));
        }}
      />

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : isError || !data ? (
        <Alert
          type="error"
          showIcon
          message={t('page.loadError')}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {t('reconciliation.retry')}
            </Button>
          }
        />
      ) : (
        <>
          {Number(data.variance) !== 0 ? (
            <Alert
              type="warning"
              showIcon
              message={t('reconciliation.varianceWarning', { amount: fmt.money(data.variance) })}
              description={t('reconciliation.varianceHint')}
            />
          ) : (
            <Alert type="success" showIcon message={t('reconciliation.balanced')} />
          )}

          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label={t('reconciliation.bankIn')}>
              {t('reconciliation.amountWithCount', {
                amount: fmt.money(data.bankIn),
                count: data.bankInCount,
              })}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.matchedSubscriptions')}>
              {fmt.money(data.matchedSubscriptions)}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.matchedHolds')}>
              {fmt.money(data.matchedHolds)}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.unmatched')}>
              {t('reconciliation.amountWithCount', {
                amount: fmt.money(data.unmatched),
                count: data.unmatchedCount,
              })}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.ignored')}>
              {fmt.money(data.ignored)}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.refundsPaid')}>
              {t('reconciliation.amountWithCount', {
                amount: fmt.money(data.refundsPaid),
                count: data.refundsPaidCount,
              })}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.refundsPending')}>
              {t('reconciliation.amountWithCount', {
                amount: fmt.money(data.refundsPending),
                count: data.refundsPendingCount,
              })}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.holdsUnsettled')}>
              {t('reconciliation.amountWithCount', {
                amount: fmt.money(data.holdsUnsettled),
                count: data.holdsUnsettledCount,
              })}
            </Descriptions.Item>
            <Descriptions.Item label={t('reconciliation.variance')}>
              <b>{fmt.money(data.variance)}</b>
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </div>
  );
}
