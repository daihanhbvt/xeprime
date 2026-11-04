'use client';

import { Alert, App, Button, Popconfirm, Skeleton, Tag } from 'antd';
import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  STATUS_COLOR,
  WALLET_ACTIVITY_SOURCE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_STATUS_META,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { bookingPath } from '@/constants/routes';
import { FinanceBoard } from '@/features/finance/components/FinanceBoard';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { WALLET_ACTIVITY_PAGE_SIZE } from '../api';
import { useCancelWithdrawal, useWalletActivity } from '../hooks';
import type { WalletActivity, WalletActivityFilters } from '../types';
import { SignedAmount } from './SignedAmount';
import { PeriodPicker } from './WalletStatementPanel';
import styles from './WalletActivityPanel.module.css';

const MIN_TABLE_WIDTH = 820;

/**
 * "BIẾN ĐỘNG SỐ DƯ" — tab thứ hai của trang Quản lý ví (design `23813:55449`).
 *
 * MỘT danh sách cho hai nguồn (`GET /shop/wallet/activity`): bút toán sổ ví (tiền chuyến, bồi
 * thường, điều chỉnh…) và lệnh rút. Trước 04/11/2026 chúng là hai khối rời ("Yêu cầu rút" ·
 * "Lịch sử giao dịch") và sổ không lọc được theo tháng. Mọi thứ của khối "Yêu cầu rút" cũ ở lại
 * trên dòng lệnh rút: ngân hàng + số tài khoản đã che, hạn chuyển / lúc đã chuyển, lý do bị từ chối
 * hay chuyển hụt, và nút Huỷ khi lệnh còn chờ duyệt.
 *
 * Trạng thái: dòng sổ luôn là "Thành công" (bút toán chỉ ghi khi tiền đã sang tay); dòng lệnh rút
 * mang đúng trạng thái của lệnh — gộp sáu trạng thái thành ba sẽ giấu đi điều quyết định nút Huỷ
 * (chờ duyệt ≠ đã duyệt chờ chuyển).
 *
 * Lệnh bị từ chối / đã huỷ chưa từng làm số dư nhúc nhích lâu dài — số tiền hiện màu nhạt.
 */
export function WalletActivityPanel({
  filters,
  onFiltersChange,
}: {
  filters: WalletActivityFilters;
  onFiltersChange: (patch: Partial<WalletActivityFilters>) => void;
}) {
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const query = useWalletActivity(filters, true);
  const cancel = useCancelWithdrawal('shop');
  const data = query.data;

  const columns = useMemo<DataTableColumn<WalletActivity>[]>(
    () => [
      {
        key: 'code',
        title: t('activity.columns.code'),
        render: (_, row) =>
          row.code == null ? (
            <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
          ) : row.bookingId ? (
            <Link className={styles.code} href={bookingPath.detail(row.bookingId)}>
              {row.code}
            </Link>
          ) : (
            <span className={styles.code}>{row.code}</span>
          ),
      },
      {
        key: 'kind',
        title: t('activity.columns.kind'),
        render: (_, row) => <ActivityKind row={row} />,
      },
      {
        key: 'occurredAt',
        title: t('activity.columns.occurredAt'),
        render: (_, row) => <span className={styles.number}>{fmt.dateTime(row.occurredAt)}</span>,
      },
      {
        key: 'amount',
        title: t('activity.columns.amount'),
        render: (_, row) => (
          <div className={styles.amount}>
            <SignedAmount value={row.amount} muted={isVoidWithdrawal(row)} />
            {row.balanceAfter == null ? null : (
              <span className={styles.muted}>
                {t('activity.balanceAfter', { amount: fmt.money(row.balanceAfter) })}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'status',
        title: t('activity.columns.status'),
        render: (_, row) =>
          row.withdrawal ? (
            <StatusTag
              value={row.withdrawal.status}
              meta={WITHDRAWAL_STATUS_META}
              group="withdrawalStatus"
            />
          ) : (
            <Tag color={STATUS_COLOR.SUCCESS}>{t('activity.posted')}</Tag>
          ),
      },
      {
        key: 'actions',
        title: <span className={styles.srOnly}>{t('activity.columns.actions')}</span>,
        align: 'right',
        render: (_, row) =>
          row.cancellable ? (
            <Popconfirm
              title={t('requests.cancelConfirm')}
              description={t('requests.cancelHint')}
              onConfirm={() =>
                cancel.mutate(row.id, {
                  onSuccess: () => message.success(t('withdraw.cancelled')),
                  onError: (err: unknown) => message.error(errorMessage(err)),
                })
              }
            >
              <Button size="small" loading={cancel.isPending && cancel.variables === row.id}>
                {t('requests.cancel')}
              </Button>
            </Popconfirm>
          ) : null,
      },
    ],
    [t, tCommon, fmt, cancel, message, errorMessage],
  );

  return (
    <FinanceBoard
      title={t('activity.title')}
      actions={
        <PeriodPicker
          period={filters.period}
          onChange={(period) => onFiltersChange({ period, page: 1 })}
        />
      }
    >
      {query.isError && !data ? (
        <Alert
          type="error"
          showIcon
          title={t('activity.loadError')}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {query.isPending && !data ? <Skeleton active paragraph={{ rows: 5 }} /> : null}

      {data ? (
        <DataTable<WalletActivity>
          label={t('activity.title')}
          columns={columns}
          items={data.items}
          rowKey={(row) => row.id}
          minWidth={MIN_TABLE_WIDTH}
          loading={query.isFetching}
          striped={false}
          empty={{ title: t('activity.empty.title'), description: t('activity.empty.body') }}
          pagination={{
            meta: {
              page: data.page,
              limit: data.limit ?? WALLET_ACTIVITY_PAGE_SIZE,
              total: data.total,
              hasNext: data.hasNext,
            },
            onChange: (page) => onFiltersChange({ page }),
            totalLabel: (total) => t('activity.totalLabel', { count: total }),
          }}
        />
      ) : null}
    </FinanceBoard>
  );
}

/** Lệnh rút không thành (từ chối / tự huỷ) — số tiền chỉ để đối chiếu, không phải khoản đã đi. */
function isVoidWithdrawal(row: WalletActivity): boolean {
  if (row.source !== WALLET_ACTIVITY_SOURCE.WITHDRAWAL || !row.withdrawal) return false;
  return (
    row.withdrawal.status === WITHDRAWAL_STATUS.REJECTED ||
    row.withdrawal.status === WITHDRAWAL_STATUS.CANCELLED ||
    row.withdrawal.status === WITHDRAWAL_STATUS.REVERSED
  );
}

/** Loại giao dịch + dòng phụ: lệnh rút kể đích chuyển và chặng đang ở; bút toán kể nguồn. */
function ActivityKind({ row }: { row: WalletActivity }) {
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  if (!row.withdrawal) {
    return (
      <span className={styles.kind}>
        {row.kind ? domainLabel('walletEntryKind', row.kind) : tCommon('labels.emptyValue')}
      </span>
    );
  }
  const w = row.withdrawal;
  const detail =
    w.status === WITHDRAWAL_STATUS.REJECTED && w.rejectReason
      ? t('requests.rejected', { reason: w.rejectReason })
      : w.status === WITHDRAWAL_STATUS.REVERSED
        ? t('requests.reversed', { reason: w.reverseReason ?? '' })
        : w.paidAt
          ? t('requests.paidAt', { time: fmt.dateTime(w.paidAt) })
          : w.dueBy &&
              (w.status === WITHDRAWAL_STATUS.PENDING || w.status === WITHDRAWAL_STATUS.APPROVED)
            ? t('requests.dueBy', { time: fmt.dateTime(w.dueBy) })
            : null;
  return (
    <div className={styles.kindStack}>
      <span className={styles.kind}>{t('activity.withdrawalKind')}</span>
      <span className={styles.muted}>
        {w.bankCode} · {w.accountNumberMasked}
      </span>
      {detail ? <span className={styles.detail}>{detail}</span> : null}
    </div>
  );
}
