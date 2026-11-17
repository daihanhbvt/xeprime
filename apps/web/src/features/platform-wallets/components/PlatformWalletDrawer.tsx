'use client';

import { Alert, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR, isNegativeMoney } from '@xeprime/domain';
import { STATUS_COLOR, WALLET_OWNER_TYPE, WALLET_STATUS } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { PLATFORM_WALLET_ENTRY_LIMIT } from '../api';
import { usePlatformWallet, usePlatformWalletEntries } from '../hooks';
import type { PlatformWalletEntry, PlatformWalletOwner } from '../types';
import styles from './PlatformWalletDrawer.module.css';

/**
 * Ví điểm của MỘT chủ ví (tài khoản khách / gian hàng) — CHỈ ĐỌC (đợt rà Admin 16/11/2026).
 *
 * Ba con số + cờ khớp sổ (tổng mọi bút toán phải bằng khả dụng + đang rút — server tính), rồi bút
 * toán mới nhất trước, phân trang ở server. Ngân hàng nhận của lệnh rút chỉ có khi người xem có
 * quyền tiền: server bỏ hẳn, giao diện không phải giấu.
 */
export function PlatformWalletDrawer({
  owner,
  onClose,
}: {
  owner: PlatformWalletOwner | null;
  onClose: () => void;
}) {
  const t = useTranslations('PlatformWallets');
  const summary = usePlatformWallet(owner);
  const name = summary.data?.ownerName ?? owner?.ownerName ?? null;

  return (
    <DetailDrawer
      title={name ? t('titleWithName', { name }) : t('title')}
      size="lg"
      open={owner != null}
      onClose={onClose}
      loading={!summary.isError && (summary.isLoading || !summary.data)}
      error={summary.isError}
      errorTitle={t('loadError')}
      onRetry={() => void summary.refetch()}
    >
      {/* `key` ép về trang 1 khi đổi chủ ví — trang của ví trước không rớt sang ví sau. */}
      {owner && summary.data ? (
        <Body key={`${owner.ownerType}:${owner.ownerId}`} owner={owner} />
      ) : null}
    </DetailDrawer>
  );
}

function Body({ owner }: { owner: PlatformWalletOwner }) {
  const t = useTranslations('PlatformWallets');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [page, setPage] = useState(1);
  const summary = usePlatformWallet(owner).data!;
  const entries = usePlatformWalletEntries(owner, page);

  const columns: DataTableColumn<PlatformWalletEntry>[] = [
    {
      key: 'createdAt',
      title: t('columns.time'),
      width: 150,
      render: (_, row) => fmt.dateTime(row.createdAt),
    },
    {
      key: 'kind',
      title: t('columns.kind'),
      render: (_, row) => (
        <div className={styles.stack}>
          <span>
            {domainLabel('walletEntryKind', row.kind)}
            {row.isReversal ? <Tag className={styles.tag}>{t('reversal')}</Tag> : null}
          </span>
          <SourceLine entry={row} />
          {row.note ? <span className={styles.secondary}>{row.note}</span> : null}
        </div>
      ),
    },
    {
      key: 'amount',
      title: t('columns.amount'),
      width: 130,
      align: 'right',
      render: (_, row) => (
        <span className={cx(styles.amount, isNegativeMoney(row.amount) ? styles.out : styles.in)}>
          {isNegativeMoney(row.amount) ? '' : '+'}
          {fmt.money(row.amount)}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      title: t('columns.balanceAfter'),
      width: 130,
      align: 'right',
      render: (_, row) => fmt.money(row.balanceAfter),
    },
  ];

  return (
    <div className={styles.body}>
      <dl className={styles.stats}>
        <Stat label={t('stats.available')} value={fmt.money(summary.available)} />
        <Stat label={t('stats.pending')} value={fmt.money(summary.pending)} />
        <Stat label={t('stats.total')} value={fmt.money(summary.total)} strong />
      </dl>

      <div className={styles.meta}>
        <span>
          {summary.ownerType === WALLET_OWNER_TYPE.TENANT
            ? t('ownerType.tenant')
            : t('ownerType.user')}
        </span>
        {summary.status !== WALLET_STATUS.ACTIVE ? (
          <Tag color={STATUS_COLOR.WARNING}>{domainLabel('walletStatus', summary.status)}</Tag>
        ) : null}
      </div>

      {!summary.exists ? (
        <Alert type="info" showIcon title={t('noWallet')} />
      ) : summary.reconciled ? (
        <Alert
          type="success"
          showIcon
          title={t('reconciled', {
            total: fmt.money(summary.ledgerTotal),
            count: summary.entryCount,
          })}
        />
      ) : (
        <Alert
          type="error"
          showIcon
          title={t('mismatch', {
            ledger: fmt.money(summary.ledgerTotal),
            total: fmt.money(summary.total),
          })}
        />
      )}

      {summary.exists ? (
        <DataTable<PlatformWalletEntry>
          label={t('entriesTitle')}
          columns={columns}
          items={entries.data?.items ?? []}
          rowKey={(row) => row.id}
          minWidth={640}
          loading={entries.isFetching}
          error={
            entries.isError && !entries.data
              ? { title: t('entriesError'), onRetry: () => void entries.refetch() }
              : null
          }
          empty={{ title: t('noEntries') }}
          pagination={{
            meta: {
              page: entries.data?.page ?? page,
              limit: entries.data?.limit ?? PLATFORM_WALLET_ENTRY_LIMIT,
              total: entries.data?.total ?? 0,
              hasNext: entries.data?.hasNext ?? false,
            },
            onChange: setPage,
            totalLabel: (total) => t('entriesTotal', { count: total }),
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={cx(styles.statValue, strong && styles.statStrong)}>{value}</dd>
    </div>
  );
}

/** Nguồn của bút toán: mã đơn · mã giữ chỗ · lệnh rút (kèm ngân hàng nhận khi có quyền tiền). */
function SourceLine({ entry }: { entry: PlatformWalletEntry }) {
  const t = useTranslations('PlatformWallets.source');
  const domainLabel = useDomainLabel();
  const parts: string[] = [];
  if (entry.bookingCode) parts.push(t('booking', { code: entry.bookingCode }));
  if (entry.holdCode) parts.push(t('hold', { code: entry.holdCode }));
  if (entry.withdrawal) {
    parts.push(
      t('withdrawal', {
        code: entry.withdrawal.code,
        status: domainLabel('withdrawalStatus', entry.withdrawal.status),
      }),
    );
    if (entry.withdrawal.bankCode && entry.withdrawal.bankAccountMasked) {
      parts.push(`${entry.withdrawal.bankCode} ${entry.withdrawal.bankAccountMasked}`);
    }
  }
  if (parts.length === 0) return null;
  return <span className={styles.secondary}>{parts.join(LIST_SEPARATOR)}</span>;
}
