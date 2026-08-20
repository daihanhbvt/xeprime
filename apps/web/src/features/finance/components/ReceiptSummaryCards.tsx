'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { isNegativeMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { ReceiptSummary } from '../types';
import styles from './ReceiptSummaryCards.module.css';

interface ReceiptSummaryCardsProps {
  data: ReceiptSummary | undefined;
  loading: boolean;
  error: boolean;
  /** Có filter nào đang bật không — đổi câu chú thích, không đổi con số. */
  filtered: boolean;
}

/**
 * Bốn con số của ĐÚNG danh sách đang xem.
 *
 * Điểm khác biệt so với dashboard `/manage/finance`: thẻ ở đây cộng cùng một vị từ với bảng bên
 * dưới (backend dùng chung `whereOf`). Một thẻ "Tổng thu" không khớp bảng ngay dưới nó là cách
 * nhanh nhất khiến người dùng thôi tin cả hai con số.
 *
 * Chỉ cộng phiếu ĐÃ DUYỆT — phiếu chờ duyệt chưa phải tiền thật, và chú thích nói rõ điều đó
 * thay vì để người dùng tự đoán vì sao tổng không khớp số dòng.
 */
export function ReceiptSummaryCards({ data, loading, error, filtered }: ReceiptSummaryCardsProps) {
  const fmt = useAppFormat();
  const t = useTranslations('Finance.receipts.summary');

  if (error && !data) {
    return <Alert className={styles.error} type="warning" showIcon message={t('error')} />;
  }

  const showSkeleton = loading && !data;
  const balanceNegative = isNegativeMoney(data?.balance);

  return (
    <div className={styles.grid}>
      <Card
        label={t('income')}
        value={data ? fmt.money(data.totalIncome) : null}
        tone={styles.income}
        loading={showSkeleton}
        breakdown={
          data
            ? [
                t('cash', { value: fmt.money(data.incomeCash) }),
                t('transfer', { value: fmt.money(data.incomeTransfer) }),
              ]
            : undefined
        }
      />
      <Card
        label={t('expense')}
        value={data ? fmt.money(data.totalExpense) : null}
        tone={styles.expense}
        loading={showSkeleton}
      />
      <Card
        label={t('balance')}
        value={data ? fmt.money(data.balance) : null}
        tone={balanceNegative ? styles.negative : styles.income}
        loading={showSkeleton}
      />
      <Card
        label={t('approvedCount')}
        value={data ? fmt.count(data.approvedCount) : null}
        tone={styles.neutral}
        loading={showSkeleton}
        breakdown={data ? [filtered ? t('inFilter') : t('wholeBook')] : undefined}
      />
    </div>
  );
}

function Card({
  label,
  value,
  tone,
  loading,
  breakdown,
}: {
  label: string;
  value: string | null;
  tone: string | undefined;
  loading: boolean;
  breakdown?: string[];
}) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{label}</span>
      {loading ? (
        <span className={styles.skeleton} aria-hidden />
      ) : (
        <span className={`${styles.value} ${tone}`}>{value ?? '—'}</span>
      )}
      {breakdown && !loading ? (
        <div className={styles.breakdown}>
          {breakdown.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
