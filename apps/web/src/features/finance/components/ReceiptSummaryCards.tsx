'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { MoneyStat } from '@/components/data-display/MoneyStat';
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

  return (
    <div className={styles.grid}>
      <MoneyStat
        label={t('income')}
        value={data ? fmt.money(data.totalIncome) : null}
        tone="positive"
        loading={showSkeleton}
        hint={
          data ? (
            <>
              <span>{t('cash', { value: fmt.money(data.incomeCash) })}</span>
              <span>{t('transfer', { value: fmt.money(data.incomeTransfer) })}</span>
            </>
          ) : undefined
        }
      />
      <MoneyStat
        label={t('expense')}
        value={data ? fmt.money(data.totalExpense) : null}
        tone="negative"
        loading={showSkeleton}
      />
      <MoneyStat
        label={t('balance')}
        value={data ? fmt.money(data.balance) : null}
        tone={isNegativeMoney(data?.balance) ? 'negative' : 'positive'}
        loading={showSkeleton}
      />
      <MoneyStat
        label={t('approvedCount')}
        value={data ? fmt.count(data.approvedCount) : null}
        loading={showSkeleton}
        hint={data ? <span>{filtered ? t('inFilter') : t('wholeBook')}</span> : undefined}
      />
    </div>
  );
}
