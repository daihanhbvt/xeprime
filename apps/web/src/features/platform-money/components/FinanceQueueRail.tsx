'use client';

import {
  BankOutlined,
  BookOutlined,
  FileTextOutlined,
  LockOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import {
  FINANCE_QUEUE,
  FINANCE_QUEUE_GROUPS,
  queueSummary,
  type FinanceQueue,
  type FinanceQueueGroupKey,
} from '../finance-queues';
import type { PlatformMoneySummary } from '../types';
import styles from './FinanceQueueRail.module.css';

const QUEUE_ICON: Readonly<Record<FinanceQueue, ComponentType<{ className?: string }>>> = {
  [FINANCE_QUEUE.BANK_IN]: BankOutlined,
  [FINANCE_QUEUE.HOLDS]: LockOutlined,
  [FINANCE_QUEUE.REFUNDS]: RollbackOutlined,
  [FINANCE_QUEUE.WITHDRAWALS]: WalletOutlined,
  [FINANCE_QUEUE.INSURANCE]: SafetyCertificateOutlined,
  [FINANCE_QUEUE.TAX]: FileTextOutlined,
  [FINANCE_QUEUE.LEDGER]: BookOutlined,
};

/** Nhãn hàng đợi — dùng chung cho cột hàng đợi và tiêu đề vùng nội dung. */
export function useFinanceQueueLabel() {
  const t = useTranslations('PlatformMoney.queues');
  const labels: Record<FinanceQueue, string> = {
    [FINANCE_QUEUE.BANK_IN]: t('bankIn'),
    [FINANCE_QUEUE.HOLDS]: t('holds'),
    [FINANCE_QUEUE.REFUNDS]: t('refunds'),
    [FINANCE_QUEUE.WITHDRAWALS]: t('withdrawals'),
    [FINANCE_QUEUE.INSURANCE]: t('insurance'),
    [FINANCE_QUEUE.TAX]: t('tax'),
    [FINANCE_QUEUE.LEDGER]: t('ledger'),
  };
  return (queue: FinanceQueue) => labels[queue];
}

/**
 * Cột HÀNG ĐỢI bên trái màn Tài chính, nhóm theo chiều tiền. Ở mobile nó thành một hàng nút cuộn
 * ngang phía trên nội dung (chỉ CSS — cùng một cây DOM, cùng thứ tự đọc).
 *
 * Mỗi mục là một nút chuyển hàng đợi, mang `aria-current` khi đang chọn; hàng đợi người dùng không
 * có quyền không được truyền vào đây, nên không có mục nào hiện ra rồi báo 403.
 */
export function FinanceQueueRail({
  visibleQueues,
  activeQueue,
  summary,
  onSelect,
}: {
  visibleQueues: readonly FinanceQueue[];
  activeQueue: FinanceQueue | null;
  summary: PlatformMoneySummary | undefined;
  onSelect: (queue: FinanceQueue) => void;
}) {
  const t = useTranslations('PlatformMoney.queues');
  const fmt = useAppFormat();
  const label = useFinanceQueueLabel();

  const groupLabel: Record<FinanceQueueGroupKey, string> = {
    moneyIn: t('groups.moneyIn'),
    held: t('groups.held'),
    moneyOut: t('groups.moneyOut'),
    thirdParty: t('groups.thirdParty'),
    ledger: t('groups.ledger'),
  };

  const groups = FINANCE_QUEUE_GROUPS.map((group) => ({
    ...group,
    queues: group.queues.filter((queue) => visibleQueues.includes(queue)),
  })).filter((group) => group.queues.length > 0);

  return (
    <nav className={styles.rail} aria-label={t('railLabel')}>
      <h2 className={styles.title}>{t('railTitle')}</h2>
      {groups.map((group) => (
        <div key={group.key} className={styles.group}>
          <h3 className={styles.groupTitle}>{groupLabel[group.key]}</h3>
          <ul className={styles.items}>
            {group.queues.map((queue) => {
              const Icon = QUEUE_ICON[queue];
              const count = summary ? (queueSummary(queue, summary)?.count ?? null) : null;
              const active = queue === activeQueue;
              return (
                <li key={queue}>
                  <button
                    type="button"
                    className={cx(styles.item, active && styles.itemActive)}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelect(queue)}
                  >
                    <Icon className={styles.icon} />
                    <span className={styles.label}>{label(queue)}</span>
                    {count !== null ? (
                      <span className={cx(styles.count, count > 0 && styles.countActive)}>
                        {fmt.count(count)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
