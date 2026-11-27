'use client';

import { App, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SCHEDULED_CREDIT_STATUS, WALLET_OWNER_TYPE } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useScheduledCreditAction,
  useScheduledCredits,
  type ScheduledCreditAction,
} from '../hooks/use-platform-money';
import type { ScheduledCredit } from '../types';
import styles from './MoneyQueue.module.css';

const MIN_TABLE_WIDTH = 980;
/** Cùng sàn với `FreezeScheduledCreditDto` — lý do tạm giữ vào audit. */
const FREEZE_NOTE_MIN = 5;

/**
 * KHOẢN CHỜ CỘNG VÍ (biên bản họp 19/11/2026): khách huỷ / không đến ⇒ tiền hoàn của khách và phần
 * của chủ xe chờ vài giờ (Cấu hình ứng dụng) trước khi vào ví. Người trực tạm giữ khoản đang tranh
 * chấp, bỏ tạm giữ, hoặc cho cộng ngay. Không có khoản nào chờ ⇒ không vẽ gì.
 */
export function ScheduledCreditsSection() {
  const t = useTranslations('PlatformMoney.scheduledCredits');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message, modal } = App.useApp();
  const { data, isFetching } = useScheduledCredits();
  const action = useScheduledCreditAction();
  const [freezing, setFreezing] = useState<ScheduledCredit | null>(null);

  const items = data ?? [];
  if (items.length === 0) return null;

  function run(next: ScheduledCreditAction, success: string, onDone?: () => void) {
    action.mutate(next, {
      onSuccess: () => {
        message.success(success);
        onDone?.();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const columns: DataTableColumn<ScheduledCredit>[] = [
    {
      title: t('columns.payee'),
      key: 'payee',
      render: (_, row) => (
        <div>
          <div>{row.ownerName ?? row.ownerId}</div>
          <span className={styles.muted}>
            {row.ownerType === WALLET_OWNER_TYPE.USER ? t('owner.customer') : t('owner.shop')}
          </span>
        </div>
      ),
    },
    {
      title: t('columns.amount'),
      key: 'amount',
      width: 140,
      render: (_, row) => fmt.money(row.amount),
    },
    {
      title: t('columns.releaseAt'),
      key: 'releaseAt',
      width: 170,
      render: (_, row) => fmt.dateTime(row.releaseAt),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 220,
      render: (_, row) =>
        row.status === SCHEDULED_CREDIT_STATUS.FROZEN ? (
          <div>
            <Tag color="red">{t('status.frozen')}</Tag>
            {row.freezeNote ? <div className={styles.muted}>{row.freezeNote}</div> : null}
          </div>
        ) : (
          <Tag color="gold">{t('status.scheduled')}</Tag>
        ),
    },
    actionColumn<ScheduledCredit>(
      (row) => [
        {
          key: 'freeze',
          label: t('actions.freeze'),
          danger: true,
          hidden: row.status !== SCHEDULED_CREDIT_STATUS.SCHEDULED,
          onClick: () => setFreezing(row),
        },
        {
          key: 'unfreeze',
          label: t('actions.unfreeze'),
          hidden: row.status !== SCHEDULED_CREDIT_STATUS.FROZEN,
          onClick: () => run({ kind: 'unfreeze', id: row.id }, t('actions.unfreezeSuccess')),
        },
        {
          key: 'release',
          label: t('actions.release'),
          onClick: () =>
            modal.confirm({
              title: t('actions.releaseConfirmTitle'),
              content: t('actions.releaseConfirmBody', {
                amount: fmt.money(row.amount),
                payee: row.ownerName ?? row.ownerId,
              }),
              okText: t('actions.release'),
              onOk: () => run({ kind: 'release', id: row.id }, t('actions.releaseSuccess')),
            }),
        },
      ],
      { width: 220, maxInline: 2 },
    ),
  ];

  return (
    <section aria-label={t('title', { count: items.length })}>
      <h3>{t('title', { count: items.length })}</h3>
      <p className={styles.muted}>{t('hint')}</p>
      <DataTable<ScheduledCredit>
        label={t('title', { count: items.length })}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching || action.isPending}
        empty={{ title: t('title', { count: 0 }) }}
      />

      <ReasonDialog
        open={freezing !== null}
        title={t('freeze.title')}
        label={t('freeze.noteLabel')}
        placeholder={t('freeze.notePlaceholder')}
        requiredMessage={t('freeze.noteRequired')}
        minLength={FREEZE_NOTE_MIN}
        maxLength={1000}
        submitText={t('actions.freeze')}
        loading={action.isPending}
        onClose={() => setFreezing(null)}
        onSubmit={(note) => {
          if (!freezing) return;
          run({ kind: 'freeze', id: freezing.id, note }, t('actions.freezeSuccess'), () =>
            setFreezing(null),
          );
        }}
      />
    </section>
  );
}
