'use client';

import { App } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { WALLET_OWNER_TYPE } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useBankAccountChangeRequests,
  useDecideBankAccountChange,
} from '../hooks/use-platform-money';
import type { PlatformBankAccountChangeRequest } from '../types';
import styles from './MoneyQueue.module.css';

const MIN_TABLE_WIDTH = 1080;
/** Cùng sàn với `RejectBankAccountChangeRequestDto`. */
const REJECT_NOTE_MIN = 5;

/**
 * YÊU CẦU ĐỔI TÀI KHOẢN NHẬN TIỀN (biên bản họp 19/11/2026): tài khoản khoá từ lần khai đầu — chủ ví
 * muốn đổi thì gửi yêu cầu, người trực GỌI ĐIỆN cho người yêu cầu (số ở cột đầu), đọc số tài khoản
 * MỚI cho họ xác nhận, rồi mới duyệt. Chỉ lượt duyệt thay tài khoản. Không có yêu cầu nào ⇒ không vẽ.
 */
export function BankAccountChangeRequestsSection() {
  const t = useTranslations('PlatformMoney.bankChangeRequests');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { data, isFetching } = useBankAccountChangeRequests();
  const decide = useDecideBankAccountChange();
  const [approving, setApproving] = useState<PlatformBankAccountChangeRequest | null>(null);
  const [rejecting, setRejecting] = useState<PlatformBankAccountChangeRequest | null>(null);

  const items = data ?? [];
  if (items.length === 0) return null;

  const columns: DataTableColumn<PlatformBankAccountChangeRequest>[] = [
    {
      title: t('columns.requester'),
      key: 'requester',
      render: (_, row) => (
        <div>
          <div>{row.ownerName ?? row.requesterName}</div>
          <span className={styles.muted}>
            {row.ownerType === WALLET_OWNER_TYPE.TENANT ? t('owner.shop') : t('owner.personal')}
            {LIST_SEPARATOR}
            {row.requesterName}
          </span>
          {row.requesterPhone ? (
            <div>
              <a href={`tel:${row.requesterPhone}`}>{row.requesterPhone}</a>
            </div>
          ) : (
            <span className={styles.muted}>{t('noPhone')}</span>
          )}
        </div>
      ),
    },
    {
      title: t('columns.current'),
      key: 'current',
      width: 220,
      render: (_, row) =>
        row.currentBankCode ? (
          <div>
            <div>{[row.currentBankCode, row.currentAccountNumberMasked].join(LIST_SEPARATOR)}</div>
            <span className={styles.muted}>{row.currentAccountName}</span>
          </div>
        ) : (
          <span className={styles.muted}>{t('noCurrent')}</span>
        ),
    },
    {
      title: t('columns.next'),
      key: 'next',
      width: 260,
      render: (_, row) => (
        <div>
          <div className={styles.mono}>
            {row.bankCode}
            {LIST_SEPARATOR}
            {row.accountNumber} <CopyButton value={row.accountNumber} label={t('columns.next')} />
          </div>
          <div>{row.accountName}</div>
          {row.note ? <span className={styles.muted}>{row.note}</span> : null}
        </div>
      ),
    },
    {
      title: t('columns.createdAt'),
      key: 'createdAt',
      width: 150,
      render: (_, row) => fmt.dateTime(row.createdAt),
    },
    actionColumn<PlatformBankAccountChangeRequest>(
      (row) => [
        { key: 'approve', label: t('actions.approve'), onClick: () => setApproving(row) },
        {
          key: 'reject',
          label: t('actions.reject'),
          danger: true,
          onClick: () => setRejecting(row),
        },
      ],
      { width: 200, maxInline: 2 },
    ),
  ];

  return (
    <section aria-label={t('title', { count: items.length })}>
      <h3>{t('title', { count: items.length })}</h3>
      <p className={styles.muted}>{t('hint')}</p>
      <DataTable<PlatformBankAccountChangeRequest>
        label={t('title', { count: items.length })}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching || decide.isPending}
        empty={{ title: t('title', { count: 0 }) }}
      />

      {/* Duyệt: ghi lại đã gọi số nào, xác minh gì — bắt buộc, vì đây là bằng chứng chính chủ. */}
      <ReasonDialog
        open={approving !== null}
        title={t('approve.title')}
        audienceHint={
          approving
            ? t('approve.hint', {
                account: [approving.bankCode, approving.accountNumber].join(LIST_SEPARATOR),
                name: approving.accountName,
              })
            : undefined
        }
        label={t('approve.noteLabel')}
        placeholder={t('approve.notePlaceholder')}
        requiredMessage={t('approve.noteRequired')}
        minLength={REJECT_NOTE_MIN}
        maxLength={1000}
        submitText={t('actions.approve')}
        loading={decide.isPending}
        onClose={() => setApproving(null)}
        onSubmit={(note) => {
          if (!approving) return;
          decide.mutate(
            { kind: 'approve', id: approving.id, note },
            {
              onSuccess: () => {
                message.success(t('approve.success'));
                setApproving(null);
              },
              onError: (err) => message.error(errorMessage(err)),
            },
          );
        }}
      />

      <ReasonDialog
        open={rejecting !== null}
        title={t('reject.title')}
        label={t('reject.noteLabel')}
        placeholder={t('reject.notePlaceholder')}
        requiredMessage={t('reject.noteRequired')}
        minLength={REJECT_NOTE_MIN}
        maxLength={1000}
        submitText={t('actions.reject')}
        loading={decide.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={(note) => {
          if (!rejecting) return;
          decide.mutate(
            { kind: 'reject', id: rejecting.id, note },
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
    </section>
  );
}
