'use client';

import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  RightOutlined,
} from '@ant-design/icons';
import { Skeleton } from 'antd';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import {
  FINANCE_QUEUE,
  TAX_PERIOD_PARAM,
  queueSummary,
  type FinanceQueue,
} from '../finance-queues';
import type { DailyReconciliation, PlatformMoneySummary } from '../types';
import { isUrgentWait, waitingAge } from '../waiting-age';
import { useWaitingAgeLabel } from './WaitingAgeText';
import styles from './FinanceSummaryStrip.module.css';

type CardTone = 'urgent' | 'attention' | 'idle';

interface QueueCard {
  queue: FinanceQueue;
  label: string;
  count: number;
  amount: string;
  tone: CardTone;
  hint?: ReactNode;
  /** Tham số mở kèm khi bấm thẻ — thẻ thuế mở thẳng KỲ CŨ NHẤT còn nợ khai. */
  params?: Record<string, string>;
}

type CardSpec = Omit<QueueCard, 'count' | 'amount'>;

interface FinanceSummaryStripProps {
  isToday: boolean;
  dateLabel: string;
  summary: PlatformMoneySummary | undefined;
  summaryLoading: boolean;
  summaryError: boolean;
  reconciliation: DailyReconciliation | undefined;
  reconciliationLoading: boolean;
  reconciliationError: boolean;
  visibleQueues: readonly FinanceQueue[];
  activeQueue: FinanceQueue | null;
  onSelect: (queue: FinanceQueue, params?: Record<string, string>) => void;
}

/**
 * Dải đầu màn Tài chính: MỘT thẻ kết luận đối soát + các thẻ đếm việc.
 *
 * Kết luận đứng đầu và to nhất: người trực mở màn này trước hết để biết "hôm nay sổ có khớp
 * không". Mỗi thẻ đếm là một nút — bấm là chuyển sang đúng hàng đợi sinh ra con số đó, và số trên
 * thẻ đếm ĐÚNG tập mà hàng đợi hiện khi không lọc (`PlatformMoneySummaryService`).
 *
 * Vạch màu bên trái nói mức cần để mắt: đỏ = có thứ quá hạn/đang tranh chấp/lỗi, cam = có việc,
 * không vạch = yên. Không thẻ nào đỏ chỉ vì CÓ SỐ — giữ chỗ chờ chốt phần lớn là chuyến đang
 * chạy bình thường.
 */
export function FinanceSummaryStrip({
  isToday,
  dateLabel,
  summary,
  summaryLoading,
  summaryError,
  reconciliation,
  reconciliationLoading,
  reconciliationError,
  visibleQueues,
  activeQueue,
  onSelect,
}: FinanceSummaryStripProps) {
  const t = useTranslations('PlatformMoney');
  const fmt = useAppFormat();
  const ageLabel = useWaitingAgeLabel();
  const canOpenLedger = visibleQueues.includes(FINANCE_QUEUE.LEDGER);

  const cards: QueueCard[] = summary ? buildCards(summary) : [];

  function buildCards(s: PlatformMoneySummary): QueueCard[] {
    const oldest = s.bankIn.oldestAt ? waitingAge(s.bankIn.oldestAt) : null;
    // Còn dòng chưa khai từ một kỳ ĐÃ QUA — kỳ đó đang đến hạn (hoặc quá hạn) kê khai.
    const taxBacklog = s.tax.oldestPeriod !== null && s.tax.oldestPeriod < s.tax.period;
    const specs: CardSpec[] = [
      {
        queue: FINANCE_QUEUE.BANK_IN,
        label: t('cards.bankIn'),
        tone: oldest && isUrgentWait(oldest) ? 'urgent' : s.bankIn.count > 0 ? 'attention' : 'idle',
        hint: oldest ? t('cards.oldest', { age: ageLabel(oldest) }) : undefined,
      },
      {
        queue: FINANCE_QUEUE.HOLDS,
        label: t('cards.holds'),
        tone: s.holds.disputeCount > 0 ? 'urgent' : 'idle',
        hint:
          s.holds.disputeCount > 0
            ? t('cards.disputes', { count: s.holds.disputeCount })
            : undefined,
      },
      {
        queue: FINANCE_QUEUE.REFUNDS,
        label: t('cards.refunds'),
        tone: s.refunds.count > 0 ? 'attention' : 'idle',
      },
      {
        queue: FINANCE_QUEUE.WITHDRAWALS,
        label: t('cards.withdrawals'),
        tone:
          s.withdrawals.overdueCount > 0
            ? 'urgent'
            : s.withdrawals.count > 0
              ? 'attention'
              : 'idle',
        hint:
          s.withdrawals.overdueCount > 0
            ? t('cards.overdue', { count: s.withdrawals.overdueCount })
            : undefined,
      },
      {
        queue: FINANCE_QUEUE.INSURANCE,
        label: t('cards.insurance'),
        tone: s.insurance.count > 0 ? 'urgent' : 'idle',
      },
      {
        queue: FINANCE_QUEUE.TAX,
        label: t('cards.tax'),
        // Thuế làm theo KỲ: dòng của kỳ đang chạy là bình thường; dòng của kỳ ĐÃ QUA là việc.
        tone: taxBacklog ? 'attention' : 'idle',
        hint: taxBacklog
          ? t('cards.taxFrom', { period: s.tax.oldestPeriod! })
          : t('cards.period', { period: s.tax.period }),
        params: s.tax.oldestPeriod ? { [TAX_PERIOD_PARAM]: s.tax.oldestPeriod } : undefined,
      },
    ];
    return specs
      .filter((spec) => visibleQueues.includes(spec.queue))
      .map((spec) => {
        const counts = queueSummary(spec.queue, s)!;
        return { ...spec, count: counts.count, amount: counts.amount };
      });
  }

  return (
    <div className={styles.strip}>
      <ReconciliationCard
        title={isToday ? t('status.titleToday') : t('status.titleDay', { date: dateLabel })}
        data={reconciliation}
        loading={reconciliationLoading}
        error={reconciliationError}
        onOpen={canOpenLedger ? () => onSelect(FINANCE_QUEUE.LEDGER) : undefined}
      />

      <div className={styles.cards} role="group" aria-label={t('cards.label')}>
        {summaryError && !summary ? (
          <p className={styles.cardsError}>{t('cards.loadError')}</p>
        ) : summaryLoading && !summary ? (
          visibleQueues
            .filter((queue) => queue !== FINANCE_QUEUE.LEDGER)
            .map((queue) => (
              <div key={queue} className={styles.card} aria-hidden>
                <Skeleton active title={false} paragraph={{ rows: 2 }} />
              </div>
            ))
        ) : (
          cards.map((card) => (
            <button
              key={card.queue}
              type="button"
              className={cx(
                styles.card,
                styles.cardButton,
                card.tone === 'urgent' && styles.toneUrgent,
                card.tone === 'attention' && styles.toneAttention,
                activeQueue === card.queue && styles.cardActive,
              )}
              aria-pressed={activeQueue === card.queue}
              onClick={() => onSelect(card.queue, card.params)}
            >
              <span className={styles.cardLabel}>{card.label}</span>
              <span className={styles.cardValue}>
                <span className={styles.cardCount}>{fmt.count(card.count)}</span>
                {card.count > 0 && Number(card.amount) > 0 ? (
                  <span className={styles.cardAmount}>{fmt.money(card.amount)}</span>
                ) : null}
              </span>
              {card.hint ? <span className={styles.cardHint}>{card.hint}</span> : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Thẻ KẾT LUẬN đối soát của ngày đang xem. Ba trạng thái, không bao giờ trộn:
 * khớp (xanh) · lệch (đỏ, kèm số) · chưa nhập số dư (xám — chưa tính được, KHÔNG phải "khớp").
 * Lệch sổ ví là lỗi riêng và kéo thẻ về đỏ dù phương trình ngân hàng có khớp.
 */
function ReconciliationCard({
  title,
  data,
  loading,
  error,
  onOpen,
}: {
  title: string;
  data: DailyReconciliation | undefined;
  loading: boolean;
  error: boolean;
  onOpen?: () => void;
}) {
  const t = useTranslations('PlatformMoney');
  const fmt = useAppFormat();

  let tone: 'success' | 'error' | 'pending' = 'pending';
  let icon: ReactNode = <ClockCircleFilled />;
  let value = t('status.missing');
  let hint: ReactNode = t('status.enterBalance');

  if (data) {
    const drift = data.walletDrift.wallets > 0;
    if (data.variance === null) {
      tone = drift ? 'error' : 'pending';
    } else if (Number(data.variance) !== 0) {
      tone = 'error';
      icon = <CloseCircleFilled />;
      value = t('status.variance', { amount: fmt.money(data.variance) });
      hint = t('status.openLedger');
    } else {
      tone = drift ? 'error' : 'success';
      icon = drift ? <CloseCircleFilled /> : <CheckCircleFilled />;
      value = t('status.balanced');
      hint = t('status.bankBalance', { amount: fmt.money(data.bankBalanceEod) });
    }
    if (drift) {
      hint = t('status.walletDrift', { count: data.walletDrift.wallets });
    }
  }

  const body =
    loading && !data ? (
      <Skeleton active title={false} paragraph={{ rows: 2 }} />
    ) : error && !data ? (
      <>
        <span className={styles.statusTitle}>{title}</span>
        <span className={styles.statusHint}>{t('status.loadError')}</span>
      </>
    ) : (
      <>
        <span className={styles.statusIcon} aria-hidden>
          {icon}
        </span>
        <span className={styles.statusText}>
          <span className={styles.statusTitle}>{title}</span>
          <span className={styles.statusValue}>{value}</span>
          <span className={styles.statusHint}>
            {hint}
            {onOpen ? <RightOutlined className={styles.statusChevron} aria-hidden /> : null}
          </span>
        </span>
      </>
    );

  const className = cx(
    styles.status,
    tone === 'success' && styles.statusSuccess,
    tone === 'error' && styles.statusError,
    tone === 'pending' && styles.statusPending,
  );

  return onOpen ? (
    <button type="button" className={cx(className, styles.statusButton)} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
