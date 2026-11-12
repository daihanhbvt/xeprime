'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DebtSummary } from '../types';
import styles from './ReceiptSummaryCards.module.css';

/**
 * Bốn thẻ đầu tab "Công nợ" — design Partner-XePrime `23857:58932`: Tổng công nợ · Nợ quá hạn ·
 * Trong hạn thanh toán · Chưa thanh toán.
 *
 * Cùng phạm vi tìm kiếm/chi nhánh/trạng thái với bảng, nhưng KHÔNG theo nhóm hạn đang mở (xem
 * `DebtSummaryDto`): mở nhóm "Chưa thu" không được làm thẻ "Nợ quá hạn" tụt về 0. "Quá hạn" và
 * "Trong hạn" không chồng nhau, cộng lại đúng "Tổng".
 *
 * Dùng chung lưới bốn cột với thẻ của tab Thu chi — hai tab cạnh nhau phải cùng một nhịp.
 */
export function DebtSummaryCards({
  data,
  loading,
  error,
}: {
  data: DebtSummary | undefined;
  loading: boolean;
  error: boolean;
}) {
  const t = useTranslations('Finance.debts.tiles');
  const tSummary = useTranslations('Finance.receipts.summary');
  const fmt = useAppFormat();

  if (error && !data) {
    return <Alert className={styles.error} type="warning" showIcon title={tSummary('error')} />;
  }

  const showSkeleton = loading && !data;

  return (
    <section className={styles.grid} aria-label={t('label')}>
      <MoneyStat
        variant="tile"
        label={t('total')}
        value={data ? fmt.money(data.totalAmount) : null}
        loading={showSkeleton}
        hint={
          data
            ? t('totalHint', { orders: data.totalCount, customers: data.customerCount })
            : undefined
        }
      />
      <MoneyStat
        variant="tile"
        label={t('overdue')}
        value={data ? fmt.money(data.overdueAmount) : null}
        tone={data && data.overdueCount > 0 ? 'negative' : 'neutral'}
        loading={showSkeleton}
        hint={data ? t('overdueHint', { count: data.overdueCount }) : undefined}
      />
      <MoneyStat
        variant="tile"
        label={t('within')}
        value={data ? fmt.money(data.withinTermAmount) : null}
        loading={showSkeleton}
        hint={data ? t('withinHint', { count: data.withinTermCount }) : undefined}
      />
      <MoneyStat
        variant="tile"
        label={t('unpaid')}
        value={data ? t('unpaidValue', { count: data.unpaidCount }) : null}
        loading={showSkeleton}
        hint={data ? t('unpaidHint', { count: data.unpaidCount }) : undefined}
      />
    </section>
  );
}
