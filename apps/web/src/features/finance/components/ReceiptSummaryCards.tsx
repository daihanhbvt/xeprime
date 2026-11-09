'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { isNegativeMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DebtSummary, ReceiptSummary } from '../types';
import styles from './ReceiptSummaryCards.module.css';

interface ReceiptSummaryCardsProps {
  data: ReceiptSummary | undefined;
  loading: boolean;
  error: boolean;
  /** Có filter nào đang bật không — đổi câu giải thích ở dấu ⓘ, không đổi con số. */
  filtered: boolean;
  /**
   * Công nợ khách hàng TẠI LÚC NÀY. `null` = người xem không vào được Công nợ (gói không có) —
   * thẻ vắng hẳn thay vì hiện một số 0 giả.
   */
  debt: { data: DebtSummary | undefined; loading: boolean; href: string } | null;
}

/**
 * Bốn thẻ đầu tab "Giao dịch thu chi" — design Partner-XePrime `23813:58308`: Tổng thu · Tổng chi ·
 * Cân đối · Công nợ khách hàng.
 *
 * Ba thẻ đầu cộng ĐÚNG danh sách đang xem (backend dùng chung `whereOf`): một thẻ "Tổng thu"
 * không khớp bảng ngay dưới nó là cách nhanh nhất khiến người dùng thôi tin cả hai con số. Chỉ
 * phiếu ĐÃ DUYỆT được cộng — dấu ⓘ nói rõ điều đó thay vì để người dùng tự đoán.
 *
 * Thẻ Công nợ thay thẻ "Số phiếu đã duyệt" cũ (chốt 04/11/2026): số phiếu đã có ở chân bảng, còn
 * khoản khách đang nợ là câu hỏi người giữ sổ hỏi ngay sau "tháng này thu bao nhiêu".
 */
export function ReceiptSummaryCards({
  data,
  loading,
  error,
  filtered,
  debt,
}: ReceiptSummaryCardsProps) {
  const fmt = useAppFormat();
  const t = useTranslations('Finance.receipts.tiles');
  const tSummary = useTranslations('Finance.receipts.summary');

  if (error && !data) {
    return <Alert className={styles.error} type="warning" showIcon title={tSummary('error')} />;
  }

  const showSkeleton = loading && !data;

  return (
    <section className={styles.grid} aria-label={t('label')}>
      <MoneyStat
        variant="tile"
        label={t('income')}
        value={data ? fmt.money(data.totalIncome) : null}
        loading={showSkeleton}
        info={{ content: filtered ? t('infoFiltered') : t('infoWhole'), label: t('infoLabel') }}
        hint={
          data
            ? t('incomeHint', {
                cash: fmt.money(data.incomeCash),
                transfer: fmt.money(data.incomeTransfer),
              })
            : undefined
        }
      />
      <MoneyStat
        variant="tile"
        label={t('expense')}
        value={data ? fmt.money(data.totalExpense) : null}
        tone="negative"
        loading={showSkeleton}
      />
      <MoneyStat
        variant="tile"
        label={t('balance')}
        value={data ? fmt.money(data.balance) : null}
        tone={isNegativeMoney(data?.balance) ? 'negative' : 'positive'}
        loading={showSkeleton}
        hint={t('balanceHint')}
      />
      {debt ? (
        <MoneyStat
          variant="tile"
          label={t('debt')}
          value={debt.data ? fmt.money(debt.data.totalAmount) : null}
          tone={debt.data && debt.data.totalCount > 0 ? 'negative' : 'neutral'}
          loading={debt.loading && !debt.data}
          hint={debt.data ? t('debtHint', { count: debt.data.totalCount }) : undefined}
          info={{ content: t('debtInfo'), label: t('debtInfoLabel') }}
          href={debt.href}
        />
      ) : null}
    </section>
  );
}
