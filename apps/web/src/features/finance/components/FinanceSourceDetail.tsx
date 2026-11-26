'use client';

import { useTranslations } from 'next-intl';
import { InfoHint } from '@/components/data-display/InfoHint';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceSourceBreakdown } from '../types';
import { revenueOf, type RevenueSourceView } from '../vehicle-finance';
import blockStyles from './CategoryBreakdown.module.css';
import { RevenueSourceCards, RevenueSourceRows } from './RevenueSource';
import styles from './FinanceSourceDetail.module.css';

interface FinanceSourceProps {
  data: FinanceSourceBreakdown | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  view: RevenueSourceView | null;
}

/**
 * Ba thẻ chọn nguồn của màn Tổng quan doanh thu (ADR 0110), trong khuôn thẻ "Nhóm thông tin" của
 * màn. Cùng thành phần với tab Tài chính của hồ sơ xe; góc nhìn nằm trên URL (`?revenueSource=`).
 */
export function FinanceSourcePicker({
  onChange,
  ...props
}: FinanceSourceProps & { onChange: (view: RevenueSourceView | null) => void }) {
  return (
    <section className={blockStyles.block}>
      <RevenueSourceCards {...props} onChange={onChange} />
    </section>
  );
}

/** "Chi tiết doanh thu từng nguồn" - danh sách theo góc nhìn đang chọn, kèm tổng của góc nhìn. */
export function FinanceSourceRowsCard(props: FinanceSourceProps) {
  const t = useTranslations('Finance.bySource.rows');
  const fmt = useAppFormat();
  const { data, view } = props;

  return (
    <section className={blockStyles.block} aria-label={t('title')}>
      <div className={styles.head}>
        <div className={styles.heading}>
          <h2 className={blockStyles.title}>
            <span className={styles.titleWithInfo}>
              {t('title')}
              <InfoHint content={t('bookedInfo')} label={t('bookedInfoLabel')} />
            </span>
          </h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        {data ? (
          <span className={styles.total}>
            {t('total', { amount: fmt.money(revenueOf(data, view)) })}
          </span>
        ) : null}
      </div>
      <RevenueSourceRows {...props} />
    </section>
  );
}
