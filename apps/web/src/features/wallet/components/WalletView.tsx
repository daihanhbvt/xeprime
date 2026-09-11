'use client';

import { App, Alert, Button, Empty, Pagination, Popconfirm, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { WITHDRAWAL_STATUS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCancelWithdrawal, useWalletEntries, useWithdrawals } from '../hooks';
import type { WalletScope } from '../types';
import { WalletSummaryCard } from './WalletSummaryCard';
import { WithdrawDialog } from './WithdrawDialog';
import styles from './WalletView.module.css';

/**
 * Màn ví điểm — dùng chung khu cá nhân và khu gian hàng, khác nhau đúng ở `scope`
 * (ADR 0023 điều 7: một bộ cho cả hai phía).
 *
 * Ba khối theo đúng thứ tự câu hỏi: *tôi có bao nhiêu* → *tiền đang đi tới đâu* → *nó đến từ đâu*.
 * Sổ phân trang ở SERVER: một chủ xe chạy vài trăm chuyến một năm có sổ dài hàng nghìn dòng.
 */
export function WalletView({ scope }: { scope: WalletScope }) {
  const t = useTranslations('Wallet');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const [page, setPage] = useState(1);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const entries = useWalletEntries(scope, page);
  const withdrawals = useWithdrawals(scope);
  const cancel = useCancelWithdrawal(scope);

  const requests = withdrawals.data ?? [];

  return (
    <div className={styles.page}>
      <WalletSummaryCard scope={scope} onWithdraw={() => setWithdrawOpen(true)} />

      <section className={styles.block} aria-label={t('requests.title')}>
        <h3 className={styles.heading}>{t('requests.title')}</h3>
        {withdrawals.isPending ? <Skeleton active paragraph={{ rows: 1 }} /> : null}
        {!withdrawals.isPending && requests.length === 0 ? (
          <p className={styles.muted}>{t('requests.empty')}</p>
        ) : null}

        <ul className={styles.list}>
          {requests.map((request) => (
            <li key={request.id} className={styles.request}>
              <div className={styles.requestMain}>
                <p className={styles.amount}>
                  {fmt.money(request.amount)} <span className={styles.code}>{request.code}</span>
                </p>
                <p className={styles.muted}>
                  {request.bankCode} · {request.accountNumberMasked}
                </p>
                {request.status === WITHDRAWAL_STATUS.REJECTED && request.rejectReason ? (
                  <p className={styles.muted}>
                    {t('requests.rejected', { reason: request.rejectReason })}
                  </p>
                ) : request.paidAt ? (
                  <p className={styles.muted}>
                    {t('requests.paidAt', { time: fmt.dateTime(request.paidAt) })}
                  </p>
                ) : request.dueBy ? (
                  <p className={styles.muted}>
                    {t('requests.dueBy', { time: fmt.dateTime(request.dueBy) })}
                  </p>
                ) : null}
              </div>
              <div className={styles.requestSide}>
                <Tag>{domainLabel('withdrawalStatus', request.status)}</Tag>
                {request.status === WITHDRAWAL_STATUS.PENDING ? (
                  <Popconfirm
                    title={t('requests.cancelConfirm')}
                    description={t('requests.cancelHint')}
                    onConfirm={() =>
                      cancel.mutate(request.id, {
                        onSuccess: () => message.success(t('withdraw.cancelled')),
                        onError: (err: unknown) => message.error(errorMessage(err)),
                      })
                    }
                  >
                    <Button size="small">{t('requests.cancel')}</Button>
                  </Popconfirm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-label={t('entries.title')}>
        <h3 className={styles.heading}>{t('entries.title')}</h3>
        {entries.isPending ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
        {entries.isError ? <Alert type="error" showIcon message={t('loadError')} /> : null}
        {!entries.isPending && (entries.data?.items.length ?? 0) === 0 ? (
          <Empty description={t('entries.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}

        <ul className={styles.list}>
          {(entries.data?.items ?? []).map((entry) => {
            const positive = Number(entry.amount) > 0;
            return (
              <li key={entry.id} className={styles.entry}>
                <div>
                  <p className={styles.entryKind}>{domainLabel('walletEntryKind', entry.kind)}</p>
                  <p className={styles.muted}>{fmt.dateTime(entry.createdAt)}</p>
                </div>
                <div className={styles.entryRight}>
                  <p className={positive ? styles.plus : styles.minus}>
                    {positive ? '+' : '−'}
                    {fmt.money(String(Math.abs(Number(entry.amount))))}
                  </p>
                  <p className={styles.muted}>
                    {t('entries.balanceAfter', { amount: fmt.money(entry.balanceAfter) })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {(entries.data?.total ?? 0) > (entries.data?.limit ?? 20) ? (
          <Pagination
            className={styles.pagination}
            current={page}
            pageSize={entries.data?.limit ?? 20}
            total={entries.data?.total ?? 0}
            showSizeChanger={false}
            onChange={setPage}
          />
        ) : null}
      </section>

      <WithdrawDialog scope={scope} open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}
