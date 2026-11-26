'use client';

import { Alert, Skeleton } from 'antd';
import { isMarketplaceBooking } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useBookingSourceText } from '@/components/data-display/BookingSourceChip';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { FinanceSourceBreakdown } from '../types';
import rowStyles from './CategoryBreakdown.module.css';
import styles from './SourceBreakdown.module.css';

interface SourceBreakdownProps {
  data: FinanceSourceBreakdown | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/**
 * Doanh thu theo NGUỒN ĐƠN (ADR 0110) - một khối trả lời ba câu của chủ xe: kỳ này thu bao nhiêu,
 * bao nhiêu đến từ sàn XePrime, bao nhiêu từ các kênh tự khai thác (và từng kênh ra sao).
 *
 * Dùng lại khuôn dòng + thanh ngang của `CategoryBreakdown` để hai khối cơ cấu đọc giống nhau. Số
 * liệu do server tính (`/finance/by-source`): tổng các dòng luôn bằng thẻ Doanh thu phía trên, nên
 * khoản thu không gắn đơn nào cũng có dòng riêng thay vì biến mất.
 */
export function SourceBreakdown({ data, loading, error, onRetry }: SourceBreakdownProps) {
  const t = useTranslations('Finance.overview.sources');
  const fmt = useAppFormat();
  const sourceText = useBookingSourceText();

  const nameOf = (item: FinanceSourceBreakdown['items'][number]): string =>
    item.source ? sourceText(item.source, item.sourceLabel) : t('unlinked');

  return (
    <section className={rowStyles.block} aria-label={t('title')}>
      <h2 className={rowStyles.title}>{t('title')}</h2>

      {error && !data ? (
        <Alert
          type="warning"
          showIcon
          title={t('error')}
          action={
            <button type="button" className={styles.retry} onClick={onRetry}>
              {t('retry')}
            </button>
          }
        />
      ) : loading && !data ? (
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState variant="empty" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <>
          <dl className={styles.totals}>
            <div className={styles.total}>
              <dt>{t('total')}</dt>
              <dd>{fmt.money(data.total)}</dd>
            </div>
            <div className={styles.total}>
              <dt>{t('marketplace')}</dt>
              <dd>{fmt.money(data.marketplaceAmount)}</dd>
            </div>
            <div className={styles.total}>
              <dt>{t('direct')}</dt>
              <dd>{fmt.money(data.directAmount)}</dd>
            </div>
          </dl>

          <ol className={rowStyles.rows}>
            {data.items.map((item) => (
              <li key={`${item.source ?? ''}|${item.sourceLabel ?? ''}`} className={rowStyles.row}>
                <div className={styles.line}>
                  <span className={rowStyles.label}>
                    <span className={rowStyles.name}>
                      {t('row', { name: nameOf(item), count: item.trips })}
                    </span>
                    <span className={rowStyles.share}>
                      {t('share', { percent: item.sharePercent })}
                    </span>
                  </span>
                  <span className={rowStyles.amount}>{fmt.money(item.amount)}</span>
                </div>
                {/* Chiều dài thanh chỉ biết lúc chạy → CSS custom property (ngoại lệ ADR 0003). */}
                <div
                  className={rowStyles.track}
                  style={{ '--xp-bar-width': `${item.sharePercent}%` } as CSSProperties}
                >
                  <div
                    className={cx(
                      styles.bar,
                      item.source && isMarketplaceBooking(item.source)
                        ? styles.barMarketplace
                        : styles.barDirect,
                    )}
                  />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
