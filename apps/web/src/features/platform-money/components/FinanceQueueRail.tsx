'use client';

import {
  BankOutlined,
  BookOutlined,
  CreditCardOutlined,
  FileTextOutlined,
  LockOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { QueueRail } from '@/components/navigation/QueueRail';
import {
  FINANCE_QUEUE,
  FINANCE_QUEUE_GROUPS,
  queueSummary,
  type FinanceQueue,
  type FinanceQueueGroupKey,
} from '../finance-queues';
import type { PlatformMoneySummary } from '../types';

const QUEUE_ICON: Readonly<Record<FinanceQueue, ComponentType<{ className?: string }>>> = {
  [FINANCE_QUEUE.BANK_IN]: BankOutlined,
  [FINANCE_QUEUE.GATEWAY_IN]: CreditCardOutlined,
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
    [FINANCE_QUEUE.GATEWAY_IN]: t('gatewayIn'),
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
 * Cột HÀNG ĐỢI của màn Tài chính, nhóm theo chiều tiền — vỏ chung `QueueRail`; ở đây chỉ còn
 * phần RIÊNG của màn: nhóm nào, nhãn gì, số đếm lấy từ đâu.
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
  const label = useFinanceQueueLabel();

  const groupLabel: Record<FinanceQueueGroupKey, string> = {
    moneyIn: t('groups.moneyIn'),
    held: t('groups.held'),
    moneyOut: t('groups.moneyOut'),
    thirdParty: t('groups.thirdParty'),
    ledger: t('groups.ledger'),
  };

  return (
    <QueueRail<FinanceQueue>
      title={t('railTitle')}
      label={t('railLabel')}
      active={activeQueue}
      onSelect={onSelect}
      groups={FINANCE_QUEUE_GROUPS.map((group) => ({
        key: group.key,
        label: groupLabel[group.key],
        items: group.queues
          .filter((queue) => visibleQueues.includes(queue))
          .map((queue) => ({
            value: queue,
            label: label(queue),
            icon: QUEUE_ICON[queue],
            count: summary ? (queueSummary(queue, summary)?.count ?? null) : null,
          })),
      }))}
    />
  );
}
