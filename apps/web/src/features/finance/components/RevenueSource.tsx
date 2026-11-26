'use client';

import { Alert, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useBookingSourceText } from '@/components/data-display/BookingSourceChip';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import type { FinanceSourceBreakdown } from '../types';
import {
  REVENUE_SOURCE_VIEW,
  itemMatchesView,
  sharePercent,
  sourceGroupOf,
  tripsOf,
  type RevenueSourceView,
  type SourceGroup,
} from '../vehicle-finance';
import styles from './RevenueSource.module.css';

/**
 * Doanh thu theo NGUỒN ĐƠN (ADR 0110) - hai mảnh dùng chung cho mọi màn tiền: tab Tài chính của hồ
 * sơ xe, màn Tổng quan doanh thu và khối thu chi của trang Tổng quan.
 *
 * Số liệu luôn là của `/finance/by-source` (server tách sàn · tự khai thác · không gắn đơn), nên
 * cùng một kỳ, cùng một phạm vi thì mọi màn ra cùng một con số.
 */

interface SourceStateProps {
  data: FinanceSourceBreakdown | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/* ─── Ba thẻ chọn nguồn ────────────────────────────────────────────────────── */

/**
 * Ba thẻ "Tất cả nguồn · Qua sàn XePrime · Nguồn ngoài" - bấm một thẻ là chọn góc nhìn. Góc nhìn
 * do màn gọi giữ (trên URL, ADR 0004); thẻ chỉ báo lên.
 */
export function RevenueSourceCards({
  data,
  loading,
  error,
  onRetry,
  view,
  onChange,
  className,
}: SourceStateProps & {
  view: RevenueSourceView | null;
  onChange: (view: RevenueSourceView | null) => void;
  className?: string;
}) {
  const t = useTranslations('Finance.bySource.cards');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  if (error) {
    return (
      <Alert
        className={className}
        type="warning"
        showIcon
        title={t('error')}
        action={
          <button type="button" className={styles.retry} onClick={onRetry}>
            {tCommon('actions.retry')}
          </button>
        }
      />
    );
  }

  const total = data?.total ?? '0';
  const marketplaceShare = data ? sharePercent(data.marketplaceAmount, total) : 0;
  const directShare = data ? sharePercent(data.directAmount, total) : 0;
  const unlinkedShare = data ? sharePercent(data.unlinkedAmount, total) : 0;
  const viewName = view === null ? t('all') : t(view);

  const cards: {
    key: RevenueSourceView | null;
    group: 'all' | SourceGroup;
    label: string;
    amount: string | null;
    trips: number | null;
    footer: ReactNode;
    bar: ReactNode;
  }[] = [
    {
      key: null,
      group: 'all',
      label: t('all'),
      amount: data?.total ?? null,
      trips: data ? tripsOf(data.items, null) : null,
      footer: <span>{t('split', { marketplace: marketplaceShare, direct: directShare })}</span>,
      bar: (
        <span className={styles.track}>
          <RevenueSourceSegment share={marketplaceShare} group="marketplace" />
          <RevenueSourceSegment share={directShare} group="direct" />
          <RevenueSourceSegment share={unlinkedShare} group="unlinked" />
        </span>
      ),
    },
    {
      key: REVENUE_SOURCE_VIEW.MARKETPLACE,
      group: 'marketplace',
      label: t('xeprime'),
      amount: data?.marketplaceAmount ?? null,
      trips: data ? tripsOf(data.items, REVENUE_SOURCE_VIEW.MARKETPLACE) : null,
      footer: (
        <>
          <span>{t('xeprimeHint')}</span>
          <span className={styles.shareMarketplace}>
            {t('share', { percent: marketplaceShare })}
          </span>
        </>
      ),
      bar: (
        <span className={styles.track}>
          <RevenueSourceSegment share={marketplaceShare} group="marketplace" />
        </span>
      ),
    },
    {
      key: REVENUE_SOURCE_VIEW.DIRECT,
      group: 'direct',
      label: t('direct'),
      amount: data?.directAmount ?? null,
      trips: data ? tripsOf(data.items, REVENUE_SOURCE_VIEW.DIRECT) : null,
      footer: (
        <>
          <span>{t('directHint')}</span>
          <span className={styles.shareDirect}>{t('share', { percent: directShare })}</span>
        </>
      ),
      bar: (
        <span className={styles.track}>
          <RevenueSourceSegment share={directShare} group="direct" />
        </span>
      ),
    },
  ];

  return (
    <div className={cx(styles.sources, className)}>
      <div className={styles.sourcesHead}>
        <span className={styles.sourcesLabel}>{t('label')}</span>
        <span className={styles.sourcesViewing}>
          {t.rich('viewing', { name: viewName, b: (chunks) => <b>{chunks}</b> })}
        </span>
      </div>
      <div className={styles.sourceCards} role="group" aria-label={t('label')}>
        {cards.map((card) => {
          const active = card.key === view;
          return (
            <button
              key={card.group}
              type="button"
              aria-pressed={active}
              className={cx(
                styles.sourceCard,
                active && styles.sourceCardActive,
                active && card.group === 'direct' && styles.sourceCardActiveDirect,
              )}
              onClick={() => onChange(card.key)}
            >
              <span className={styles.sourceCardHead}>
                <span className={cx(styles.sourceName, styles[`name_${card.group}`])}>
                  {card.group !== 'all' ? (
                    <span className={cx(styles.dot, styles[`dot_${card.group}`])} aria-hidden />
                  ) : null}
                  {card.label}
                </span>
                {card.trips !== null ? (
                  <span className={cx(styles.pill, styles[`pill_${card.group}`])}>
                    {t('trips', { count: card.trips })}
                  </span>
                ) : null}
              </span>
              {loading ? (
                <Skeleton.Input active size="small" />
              ) : (
                <span className={styles.sourceAmount}>
                  {card.amount !== null ? fmt.money(card.amount) : '-'}
                </span>
              )}
              {card.bar}
              <span className={styles.sourceFooter}>{card.footer}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Một khúc của thanh tỷ trọng - bề rộng chỉ biết lúc chạy ⇒ CSS custom property (ngoại lệ ADR
 * 0003). Đặt trong một `.track` (rãnh) để các khúc xếp liền nhau.
 */
export function RevenueSourceSegment({ share, group }: { share: number; group: SourceGroup }) {
  if (share <= 0) return null;
  return (
    <span
      className={cx(styles.segment, styles[`bar_${group}`])}
      style={{ '--xp-bar-width': `${share}%` } as CSSProperties}
    />
  );
}

/** Rãnh của thanh tỷ trọng - cho màn tự ghép các khúc `RevenueSourceSegment`. */
export function RevenueSourceTrack({ children }: { children: ReactNode }) {
  return <span className={styles.track}>{children}</span>;
}

/* ─── Chi tiết từng nguồn ──────────────────────────────────────────────────── */

/**
 * Danh sách từng nguồn (khách quen, vãng lai, mạng xã hội...) dưới góc nhìn đang chọn. Chỉ phần
 * THÂN - tiêu đề, tổng và khung thẻ là của màn gọi, vì mỗi màn có khuôn thẻ riêng.
 */
export function RevenueSourceRows({
  data,
  loading,
  error,
  onRetry,
  view,
}: SourceStateProps & { view: RevenueSourceView | null }) {
  const t = useTranslations('Finance.bySource.rows');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const sourceText = useBookingSourceText();

  if (error) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('error')}
        action={
          <button type="button" className={styles.retry} onClick={onRetry}>
            {tCommon('actions.retry')}
          </button>
        }
      />
    );
  }
  if (loading) return <Skeleton active title={false} paragraph={{ rows: 4 }} />;

  const items = data?.items.filter((item) => itemMatchesView(item, view)) ?? [];
  if (items.length === 0) {
    return <EmptyState variant="empty" title={t('empty')} description={t('emptyHint')} />;
  }

  const nameOf = (item: FinanceSourceBreakdown['items'][number]) =>
    item.source ? sourceText(item.source, item.sourceLabel) : t('unlinkedName');

  return (
    <ol className={styles.rows}>
      {items.map((item) => {
        const group = sourceGroupOf(item);
        return (
          <li key={`${item.source ?? ''}|${item.sourceLabel ?? ''}`} className={styles.row}>
            <div className={styles.rowLine}>
              <span className={styles.rowName}>
                <span className={styles.rowNameText}>{nameOf(item)}</span>
                <span className={cx(styles.pill, styles[`pill_${group}`])}>
                  {t(`tag.${group}`)}
                </span>
              </span>
              <span className={styles.rowAmount}>{fmt.money(item.amount)}</span>
            </div>
            <div className={styles.rowMeta}>
              <span>
                {/* Khoản không gắn đơn không có chuyến - nói nó LÀ gì thay cho "0 chuyến". */}
                {group === 'unlinked' ? t('unlinkedHint') : t('trips', { count: item.trips })}
                {!isZeroMoney(item.bookedAmount) ? (
                  <>
                    {LIST_SEPARATOR}
                    {t('booked', { amount: fmt.money(item.bookedAmount) })}
                  </>
                ) : null}
              </span>
              <span className={styles.rowShare}>{t('share', { percent: item.sharePercent })}</span>
            </div>
            <span className={styles.track}>
              <RevenueSourceSegment share={item.sharePercent} group={group} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
