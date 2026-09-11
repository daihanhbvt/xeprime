'use client';

import { App, Alert, Button, Popconfirm, Segmented, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WITHDRAWAL_STATUS } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useApproveWithdrawal,
  useRejectWithdrawal,
  useWithdrawalQueue,
} from '../hooks/use-platform-money';
import type { PlatformWithdrawal } from '../types';
import { WithdrawalPaidModal } from './WithdrawalPaidModal';
import styles from './WithdrawalQueue.module.css';

/** Sáu cột thông tin + một cột hành động; hẹp hơn thì cuộn ngang, không nén. */
const MIN_TABLE_WIDTH = 1120;

/**
 * Hàng đợi RÚT TIỀN của admin — ADR 0033, ADR 0025 điều 7.
 *
 * Mỗi dòng là một việc TAY: chuyển khoản ở VN là đẩy, nền tảng không tự chi được. Bảng sắp
 * CŨ NHẤT TRƯỚC (thứ tự chờ, không phải thứ tự mới) và đánh dấu lệnh quá hạn cam kết ngay trên
 * dòng — quá hạn phải nhìn thấy được, không phải tìm bằng cách đọc từng dòng.
 *
 * Số tài khoản hiện ĐẦY ĐỦ ở đây, khác mọi bề mặt khác trong sản phẩm: người ngồi màn này phải
 * gõ nó vào app ngân hàng, nên che nó là biến một việc tay thành một việc tay có thêm bước đoán.
 */
export function WithdrawalQueue() {
  const t = useTranslations('Wallet.admin');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [paidTarget, setPaidTarget] = useState<PlatformWithdrawal | null>(null);

  const { data, isFetching, isError, refetch } = useWithdrawalQueue({
    overdue: overdueOnly,
    page,
  });
  const approve = useApproveWithdrawal();
  const reject = useRejectWithdrawal();

  const items = data?.items ?? [];

  const columns = useMemo<DataTableColumn<PlatformWithdrawal>[]>(
    () => [
      {
        key: 'code',
        title: t('columns.code'),
        render: (row) => (
          <span className={styles.code}>
            {row.code} <CopyButton value={row.code} label={t('columns.code')} />
          </span>
        ),
      },
      {
        key: 'owner',
        title: t('columns.owner'),
        render: (row) => (
          <div>
            <p className={styles.strong}>{row.ownerName ?? '—'}</p>
            {/* Nhánh tường minh thay vì khoá động: `next-intl` kiểm khoá lúc biên dịch, và
                một khoá dựng bằng template string làm mất luôn lớp kiểm đó. */}
            <p className={styles.muted}>
              {row.ownerType === 'tenant' ? t('ownerType.tenant') : t('ownerType.user')}
            </p>
          </div>
        ),
      },
      {
        key: 'amount',
        title: t('columns.amount'),
        render: (row) => <span className={styles.amount}>{fmt.money(row.amount)}</span>,
      },
      {
        key: 'account',
        title: t('columns.account'),
        render: (row) => (
          <div>
            <p className={styles.strong}>
              {row.bankCode} · {row.bankAccountNumber}{' '}
              <CopyButton value={row.bankAccountNumber} label={t('columns.account')} />
            </p>
            <p className={styles.muted}>{row.bankAccountName}</p>
          </div>
        ),
      },
      {
        key: 'dueBy',
        title: t('columns.dueBy'),
        render: (row) => (
          <div>
            <p className={row.overdue ? styles.overdue : undefined}>
              {row.dueBy ? fmt.dateTime(row.dueBy) : '—'}
            </p>
            <p className={styles.muted}>{t('columns.age', { hours: row.ageHours })}</p>
          </div>
        ),
      },
      {
        key: 'status',
        title: t('columns.status'),
        render: (row) => <Tag>{domainLabel('withdrawalStatus', row.status)}</Tag>,
      },
      {
        key: 'actions',
        title: '',
        render: (row) => (
          <div className={styles.actions}>
            {row.status === WITHDRAWAL_STATUS.PENDING ? (
              <Button
                size="small"
                type="primary"
                onClick={() =>
                  approve.mutate(row.id, {
                    onSuccess: () => message.success(t('actions.approved')),
                    onError: (err: unknown) => message.error(errorMessage(err)),
                  })
                }
              >
                {t('actions.approve')}
              </Button>
            ) : null}

            {row.status === WITHDRAWAL_STATUS.APPROVED ? (
              <Button size="small" type="primary" onClick={() => setPaidTarget(row)}>
                {t('actions.markPaid')}
              </Button>
            ) : null}

            {row.status === WITHDRAWAL_STATUS.PENDING ||
            row.status === WITHDRAWAL_STATUS.APPROVED ? (
              <Popconfirm
                title={t('reject.title')}
                description={t('reject.reasonHint')}
                onConfirm={() =>
                  reject.mutate(
                    { id: row.id, reason: t('reject.title') },
                    {
                      onSuccess: () => message.success(t('reject.done')),
                      onError: (err: unknown) => message.error(errorMessage(err)),
                    },
                  )
                }
              >
                <Button size="small" danger>
                  {t('actions.reject')}
                </Button>
              </Popconfirm>
            ) : null}
          </div>
        ),
      },
    ],
    [approve, domainLabel, errorMessage, fmt, message, reject, t],
  );

  return (
    <div className={styles.panel}>
      <p className={styles.subtitle}>{t('subtitle')}</p>

      {(data?.overdueCount ?? 0) > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={t('overdueBanner', { count: data!.overdueCount })}
        />
      ) : null}

      <Segmented
        value={overdueOnly ? 'overdue' : 'all'}
        onChange={(value) => {
          setOverdueOnly(value === 'overdue');
          setPage(1);
        }}
        options={[
          { value: 'all', label: t('title') },
          { value: 'overdue', label: t('overdueBanner', { count: data?.overdueCount ?? 0 }) },
        ]}
      />

      <DataTable<PlatformWithdrawal>
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('empty'), onRetry: () => void refetch() } : null}
        empty={{ title: t('empty') }}
        pagination={{
          meta: {
            page: data?.page ?? 1,
            limit: data?.limit ?? 20,
            total: data?.total ?? 0,
            hasNext: data?.hasNext ?? false,
          },
          onChange: (next) => setPage(next),
          totalLabel: (total) => t('overdueBanner', { count: total }),
        }}
      />

      <WithdrawalPaidModal
        withdrawal={paidTarget}
        open={paidTarget != null}
        onClose={() => setPaidTarget(null)}
      />
    </div>
  );
}
