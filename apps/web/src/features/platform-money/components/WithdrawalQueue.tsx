'use client';

import { App, Alert, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  WITHDRAWAL_STATUS,
  WITHDRAWAL_STATUS_META,
  WALLET_OWNER_TYPE,
  type WithdrawalStatus,
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
import {
  useApproveWithdrawal,
  useRejectWithdrawal,
  useReverseWithdrawal,
  useWithdrawalQueue,
} from '../hooks/use-platform-money';
import type { PlatformWithdrawal } from '../types';
import { waitingAge } from '../waiting-age';
import { QueueViewSwitch } from './QueueViewSwitch';
import { useWaitingAgeLabel } from './WaitingAgeText';
import { WithdrawalPaidModal } from './WithdrawalPaidModal';
import styles from './MoneyQueue.module.css';

/** Bốn cột cố định (700px) + cột chủ ví tối thiểu 180px — vừa vùng nội dung ở 1366px trở lên. */
const MIN_TABLE_WIDTH = 880;
/** Cùng sàn với `RejectWithdrawalDto` / `ReverseWithdrawalDto`. */
const REASON_MIN = 3;
const REASON_MAX = 500;

/**
 * Năm góc nhìn của hàng đợi — `actionable` (vắng trên URL) là VIỆC CẦN LÀM: chờ duyệt + đã duyệt
 * chưa chuyển. Ba trạng thái cuối là lịch sử, để tra lại "lệnh đó đã chuyển chưa, mã GD gì".
 */
const VIEW = {
  ACTIONABLE: 'actionable',
  OVERDUE: 'overdue',
  PAID: WITHDRAWAL_STATUS.PAID,
  REJECTED: WITHDRAWAL_STATUS.REJECTED,
  CANCELLED: WITHDRAWAL_STATUS.CANCELLED,
  REVERSED: WITHDRAWAL_STATUS.REVERSED,
} as const;
type View = (typeof VIEW)[keyof typeof VIEW];
const VIEW_VALUES = Object.values(VIEW) as View[];

const HISTORY_STATUS: Partial<Record<View, WithdrawalStatus>> = {
  [VIEW.PAID]: WITHDRAWAL_STATUS.PAID,
  [VIEW.REJECTED]: WITHDRAWAL_STATUS.REJECTED,
  [VIEW.CANCELLED]: WITHDRAWAL_STATUS.CANCELLED,
  [VIEW.REVERSED]: WITHDRAWAL_STATUS.REVERSED,
};

interface WithdrawalUrlFilters {
  view?: Exclude<View, typeof VIEW.ACTIONABLE>;
  page?: number;
}

function parse(params: URLSearchParams): WithdrawalUrlFilters {
  const view = params.get('view');
  return {
    view:
      view && view !== VIEW.ACTIONABLE && (VIEW_VALUES as string[]).includes(view)
        ? (view as WithdrawalUrlFilters['view'])
        : undefined,
    page: positiveIntParam(params, 'page'),
  };
}

/**
 * Hàng đợi RÚT TIỀN của admin — ADR 0033, ADR 0025 điều 7.
 *
 * Mỗi dòng là một việc TAY: chuyển khoản ở VN là đẩy, nền tảng không tự chi được. Bảng sắp CŨ
 * NHẤT TRƯỚC và đánh dấu lệnh quá hạn cam kết ngay trên dòng.
 *
 * Số tài khoản hiện ĐẦY ĐỦ ở đây, khác mọi bề mặt khác trong sản phẩm: người ngồi màn này phải gõ
 * nó vào app ngân hàng, nên che nó là biến một việc tay thành một việc tay có thêm bước đoán.
 *
 * Từ chối và đảo lệnh đều bắt nhập LÝ DO thật — chủ ví đọc câu đó.
 */
export function WithdrawalQueue() {
  const t = useTranslations('Wallet.admin');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useUrlFilters(parse);
  const ageLabel = useWaitingAgeLabel();

  const view: View = filters.view ?? VIEW.ACTIONABLE;
  const [paidTarget, setPaidTarget] = useState<PlatformWithdrawal | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PlatformWithdrawal | null>(null);
  const [reverseTarget, setReverseTarget] = useState<PlatformWithdrawal | null>(null);

  const { data, isFetching, isError, refetch } = useWithdrawalQueue({
    overdue: view === VIEW.OVERDUE,
    status: HISTORY_STATUS[view] ?? null,
    page: filters.page,
  });
  const approve = useApproveWithdrawal();
  const reject = useRejectWithdrawal();
  const reverse = useReverseWithdrawal();

  const items = data?.items ?? [];
  const overdueCount = data?.overdueCount ?? 0;

  const viewLabel: Record<View, string> = {
    [VIEW.ACTIONABLE]: t('views.actionable'),
    [VIEW.OVERDUE]: t('views.overdue', { count: overdueCount }),
    [VIEW.PAID]: domainLabel('withdrawalStatus', WITHDRAWAL_STATUS.PAID),
    [VIEW.REJECTED]: domainLabel('withdrawalStatus', WITHDRAWAL_STATUS.REJECTED),
    [VIEW.CANCELLED]: domainLabel('withdrawalStatus', WITHDRAWAL_STATUS.CANCELLED),
    [VIEW.REVERSED]: domainLabel('withdrawalStatus', WITHDRAWAL_STATUS.REVERSED),
  };

  const columns: DataTableColumn<PlatformWithdrawal>[] = [
    {
      // Chủ ví + mã lệnh trong MỘT ô: mã là thứ đọc lại khi hỏi hỗ trợ, không cần một cột riêng.
      key: 'owner',
      title: t('columns.owner'),
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.strong}>{row.ownerName ?? tCommon('labels.emptyValue')}</span>
          <span className={styles.secondary}>
            {row.ownerType === WALLET_OWNER_TYPE.TENANT
              ? t('ownerType.tenant')
              : t('ownerType.user')}
          </span>
          <span className={styles.inlineCode}>
            <span className={styles.mono}>{row.code}</span>
            <CopyButton value={row.code} label={t('columns.code')} />
          </span>
        </div>
      ),
    },
    {
      key: 'amount',
      title: t('columns.amount'),
      width: 110,
      align: 'right',
      render: (_, row) => <span className={styles.amount}>{fmt.money(row.amount)}</span>,
    },
    {
      key: 'account',
      title: t('columns.account'),
      width: 230,
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.inlineCode}>
            <span className={styles.mono}>
              {row.bankCode} · {row.bankAccountNumber}
            </span>
            <CopyButton value={row.bankAccountNumber} label={t('columns.account')} />
          </span>
          <span className={styles.secondary}>{row.bankAccountName}</span>
        </div>
      ),
    },
    {
      /*
       * Trạng thái + HẠN CHUYỂN trong cùng một ô: hạn chỉ có nghĩa với lệnh đã duyệt, và người
       * trực đọc hai thứ đó cùng lúc ("đã duyệt — còn bao lâu"). Tách hai cột là bắt bảng cuộn
       * ngang mới thấy nút hành động.
       */
      key: 'status',
      title: t('columns.status'),
      width: 170,
      render: (_, row) => (
        <div className={styles.stack}>
          <StatusTag
            value={row.status as WithdrawalStatus}
            meta={WITHDRAWAL_STATUS_META}
            group="withdrawalStatus"
          />
          {row.dueBy ? (
            <span className={row.overdue ? styles.overdue : styles.secondary}>
              {t('columns.dueByValue', { date: fmt.dateTime(row.dueBy) })}
            </span>
          ) : null}
          {row.status === WITHDRAWAL_STATUS.PENDING || row.status === WITHDRAWAL_STATUS.APPROVED ? (
            // Cùng cách đọc "đã chờ" với hàng đợi tiền vào ("1 ngày", không "36 giờ").
            <span className={styles.tertiary}>
              {t('columns.age', { age: ageLabel(waitingAge(row.createdAt)) })}
            </span>
          ) : null}
          {row.status === WITHDRAWAL_STATUS.PAID && row.bankReference ? (
            <span className={styles.secondary}>
              {t('columns.paidReference', { reference: row.bankReference })}
            </span>
          ) : null}
          {row.status === WITHDRAWAL_STATUS.REJECTED && row.rejectReason ? (
            <span className={styles.secondary}>{row.rejectReason}</span>
          ) : null}
          {row.status === WITHDRAWAL_STATUS.REVERSED && row.reverseReason ? (
            <span className={styles.secondary}>{row.reverseReason}</span>
          ) : null}
        </div>
      ),
    },
    actionColumn<PlatformWithdrawal>(
      (row) => [
        {
          key: 'approve',
          label: t('actions.approve'),
          primary: true,
          hidden: row.status !== WITHDRAWAL_STATUS.PENDING,
          loading: approve.isPending && approve.variables === row.id,
          onClick: () =>
            approve.mutate(row.id, {
              onSuccess: () => message.success(t('actions.approved')),
              onError: (err: unknown) => message.error(errorMessage(err)),
            }),
        },
        {
          key: 'paid',
          label: t('actions.markPaid'),
          primary: true,
          hidden: row.status !== WITHDRAWAL_STATUS.APPROVED,
          onClick: () => setPaidTarget(row),
        },
        {
          key: 'reject',
          label: t('actions.reject'),
          danger: true,
          hidden:
            row.status !== WITHDRAWAL_STATUS.PENDING && row.status !== WITHDRAWAL_STATUS.APPROVED,
          onClick: () => setRejectTarget(row),
        },
        {
          key: 'reverse',
          label: t('actions.reverse'),
          danger: true,
          hidden: row.status !== WITHDRAWAL_STATUS.PAID,
          onClick: () => setReverseTarget(row),
        },
      ],
      { width: 190, maxInline: 1 },
    ),
  ];

  return (
    <div className={styles.panel}>
      {view === VIEW.ACTIONABLE && overdueCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('overdueBanner', { count: overdueCount })}
          action={
            <Button size="small" onClick={() => setFilters({ view: VIEW.OVERDUE })}>
              {t('views.showOverdue')}
            </Button>
          }
        />
      ) : null}

      <QueueViewSwitch<View>
        label={t('views.label')}
        value={view}
        options={VIEW_VALUES.map((value) => ({ value, label: viewLabel[value] }))}
        // "Cần xử lý" là mặc định — không ghi lên URL.
        onChange={(next) => setFilters({ view: next === VIEW.ACTIONABLE ? undefined : next })}
      />

      <DataTable<PlatformWithdrawal>
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        filtered={view !== VIEW.ACTIONABLE}
        empty={{ title: t('empty') }}
        noResults={{ title: t('emptyView') }}
        pagination={{
          meta: {
            page: data?.page ?? 1,
            limit: data?.limit ?? MONEY_DEFAULT_LIMIT,
            total: data?.total ?? 0,
            hasNext: data?.hasNext ?? false,
          },
          onChange: (page) => setFilters({ page }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      <WithdrawalPaidModal
        withdrawal={paidTarget}
        open={paidTarget != null}
        onClose={() => setPaidTarget(null)}
      />

      <ReasonDialog
        open={rejectTarget !== null}
        title={t('reject.title')}
        audienceHint={t('reject.reasonHint')}
        label={t('reject.reason')}
        placeholder={t('reject.reasonPlaceholder')}
        requiredMessage={t('reject.reasonRequired')}
        minLength={REASON_MIN}
        maxLength={REASON_MAX}
        submitText={t('reject.submit')}
        loading={reject.isPending}
        onClose={() => setRejectTarget(null)}
        onSubmit={(reason) => {
          if (!rejectTarget) return;
          reject.mutate(
            { id: rejectTarget.id, reason },
            {
              onSuccess: () => {
                message.success(t('reject.done'));
                setRejectTarget(null);
              },
              onError: (err: unknown) => message.error(errorMessage(err)),
            },
          );
        }}
      />

      <ReasonDialog
        open={reverseTarget !== null}
        title={t('reverse.title')}
        audienceHint={t('reverse.reasonHint')}
        label={t('reverse.reason')}
        placeholder={t('reverse.reasonPlaceholder')}
        requiredMessage={t('reverse.reasonRequired')}
        minLength={REASON_MIN}
        maxLength={REASON_MAX}
        submitText={t('reverse.submit')}
        loading={reverse.isPending}
        onClose={() => setReverseTarget(null)}
        onSubmit={(reason) => {
          if (!reverseTarget) return;
          reverse.mutate(
            { id: reverseTarget.id, reason, rowVersion: reverseTarget.rowVersion },
            {
              onSuccess: () => {
                message.success(t('reverse.done'));
                setReverseTarget(null);
              },
              onError: (err: unknown) => message.error(errorMessage(err)),
            },
          );
        }}
      />
    </div>
  );
}
