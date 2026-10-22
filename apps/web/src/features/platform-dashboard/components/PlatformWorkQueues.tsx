'use client';

import {
  AuditOutlined,
  BankOutlined,
  CustomerServiceOutlined,
  PhoneOutlined,
  RollbackOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { FOLLOW_UPS_HREF } from '@/features/admin-follow-ups/constants';
import { ROUTES } from '@/constants/routes';
import { ActionTile, type ActionTileMeta } from '@/features/dashboard/components/ActionTile';
import {
  BANK_IN_URGENT_HOURS,
  FINANCE_QUEUE,
  financeQueueHref,
} from '@/features/platform-money/finance-queues';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import type { usePlatformQueues } from '../hooks/use-platform-queues';
import styles from './PlatformDashboardView.module.css';

type Queues = ReturnType<typeof usePlatformQueues>;

export type PlatformQueueKey =
  'vehicles' | 'followUps' | 'bankIn' | 'withdrawals' | 'refunds' | 'cases';

interface QueueTile {
  key: PlatformQueueKey;
  icon: ComponentType<{ className?: string }>;
  href: string;
  /** `undefined` đang tải · `null` lỗi · số = có dữ liệu. */
  count: number | null | undefined;
  urgent: boolean;
  meta: ActionTileMeta[];
}

/** Số của một truy vấn theo quy ước của `ActionTile`. */
function countOf<T>(
  query: { data?: T; isError: boolean },
  pick: (data: T) => number,
): number | null | undefined {
  if (query.data !== undefined) return pick(query.data);
  return query.isError ? null : undefined;
}

/**
 * Các ô hàng đợi người trực được phép xử lý — theo thứ tự có người đang CHỜ ở đầu kia: xe chờ lên
 * chợ, khách chờ được thuê (bằng lái), tiền chờ khớp, đối tác chờ nhận tiền, khách chờ tiền hoàn,
 * khiếu nại chờ trả lời.
 */
export function usePlatformQueueTiles(queues: Queues): QueueTile[] {
  const t = useTranslations('PlatformDashboard.queues');
  const fmt = useAppFormat();
  const { can, summary, followUps, money, cases } = queues;
  const tiles: QueueTile[] = [];

  if (can.vehicles) {
    tiles.push({
      key: 'vehicles',
      icon: AuditOutlined,
      href: ROUTES.ADMIN.ROOT,
      count: countOf(summary, (s) => s.approvalPendingVehicle),
      urgent: false,
      meta: [],
    });
  }
  if (can.followUps) {
    tiles.push({
      key: 'followUps',
      icon: PhoneOutlined,
      href: FOLLOW_UPS_HREF,
      count: countOf(followUps, (c) => c),
      urgent: false,
      meta: [],
    });
  }
  if (can.money) {
    const bankIn = money.data?.bankIn;
    // Khoản chưa khớp quá ngưỡng là KHẨN: cùng mốc với hàng đợi tiền vào ở màn Tài chính.
    const bankInStale = Boolean(
      bankIn?.oldestAt && dayjs().diff(dayjs(bankIn.oldestAt), 'hour') >= BANK_IN_URGENT_HOURS,
    );
    tiles.push({
      key: 'bankIn',
      icon: BankOutlined,
      href: financeQueueHref(FINANCE_QUEUE.BANK_IN),
      count: countOf(money, (m) => m.bankIn.count),
      urgent: bankInStale,
      meta:
        bankIn && bankIn.count > 0
          ? [{ key: 'amount', text: t('bankIn.amount', { amount: fmt.money(bankIn.amount) }) }]
          : [],
    });
    const withdrawals = money.data?.withdrawals;
    tiles.push({
      key: 'withdrawals',
      icon: SendOutlined,
      href: financeQueueHref(FINANCE_QUEUE.WITHDRAWALS),
      count: countOf(money, (m) => m.withdrawals.count),
      urgent: Boolean(withdrawals && withdrawals.overdueCount > 0),
      meta:
        withdrawals && withdrawals.overdueCount > 0
          ? [
              {
                key: 'overdue',
                text: t('withdrawals.overdue', { count: withdrawals.overdueCount }),
                urgent: true,
              },
            ]
          : [],
    });
    tiles.push({
      key: 'refunds',
      icon: RollbackOutlined,
      href: financeQueueHref(FINANCE_QUEUE.REFUNDS),
      count: countOf(money, (m) => m.refunds.count),
      urgent: false,
      meta: [],
    });
  }
  if (can.cases) {
    tiles.push({
      key: 'cases',
      icon: CustomerServiceOutlined,
      href: ROUTES.ADMIN.SUPPORT,
      count: countOf(cases, (total) => total),
      urgent: false,
      meta: [],
    });
  }
  return tiles;
}

export function PlatformWorkQueues({ tiles }: { tiles: QueueTile[] }) {
  const t = useTranslations('PlatformDashboard.queues');
  if (tiles.length === 0) return null;
  return (
    <section className={styles.queues} aria-label={t('title')}>
      {tiles.map((tile) => (
        <ActionTile
          key={tile.key}
          icon={tile.icon}
          label={t(`${tile.key}.label`)}
          count={tile.count}
          href={tile.href}
          tone={tile.urgent ? 'urgent' : 'attention'}
          meta={tile.meta}
          emptyText={t('none')}
          errorText={t('loadError')}
        />
      ))}
    </section>
  );
}
