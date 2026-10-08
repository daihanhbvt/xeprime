'use client';

import { CalendarOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { PLATFORM_TRIP_QUEUE_VALUES, type PlatformTripQueue } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { TripSummary } from '../types';
import { useTripQueueLabel } from './TripQueueRail';
import styles from './TripSummaryStrip.module.css';

type CardTone = 'urgent' | 'attention' | 'idle';

/**
 * Dải đầu màn Vận hành chuyến: MỘT thẻ trả lời "hôm nay giao/nhận bao nhiêu xe" + bốn thẻ đếm
 * việc, mỗi thẻ là một nút mở đúng hàng đợi sinh ra con số đó (UX §1.5).
 *
 * Vạch màu bên trái nói mức cần để mắt: đỏ = có dòng quá hạn/quá giờ (việc hỏng), cam = có việc
 * đang chờ, không vạch = yên. Không thẻ nào đỏ chỉ vì CÓ SỐ — hai mươi chuyến đang chạy là bình
 * thường, hai chuyến quá giờ trả mới là việc.
 */
export function TripSummaryStrip({
  summary,
  loading,
  error,
  activeQueue,
  onSelect,
}: {
  summary: TripSummary | undefined;
  loading: boolean;
  error: boolean;
  activeQueue: PlatformTripQueue;
  onSelect: (queue: PlatformTripQueue) => void;
}) {
  const t = useTranslations('AdminTrips');
  const fmt = useAppFormat();
  const label = useTripQueueLabel();

  return (
    <div className={styles.strip}>
      <div className={cx(styles.today, !summary && styles.todayPending)}>
        <span className={styles.todayIcon} aria-hidden>
          <CalendarOutlined />
        </span>
        <span className={styles.todayText}>
          <span className={styles.todayTitle}>{t('today.title')}</span>
          {summary ? (
            <span className={styles.todayValue}>
              <span>{t('today.pickups', { count: summary.today.pickups })}</span>
              <span className={styles.todayDot} aria-hidden>
                ·
              </span>
              <span>{t('today.returns', { count: summary.today.returns })}</span>
            </span>
          ) : loading ? (
            <Skeleton active title={false} paragraph={{ rows: 1 }} />
          ) : (
            <span className={styles.todayHint}>{t('today.loadError')}</span>
          )}
        </span>
      </div>

      <div className={styles.cards} role="group" aria-label={t('cards.label')}>
        {error && !summary ? (
          <p className={styles.cardsError}>{t('cards.loadError')}</p>
        ) : !summary ? (
          PLATFORM_TRIP_QUEUE_VALUES.map((queue) => (
            <div key={queue} className={styles.card} aria-hidden>
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </div>
          ))
        ) : (
          PLATFORM_TRIP_QUEUE_VALUES.map((queue) => {
            const { count, urgentCount } = summary.queues[queue];
            const tone: CardTone =
              urgentCount > 0 ? 'urgent' : count > 0 ? 'attention' : 'idle';
            const hint =
              urgentCount > 0
                ? t(`cards.urgent.${queue}`, { count: urgentCount })
                : count > 0
                  ? t(`cards.calm.${queue}`)
                  : null;
            return (
              <button
                key={queue}
                type="button"
                className={cx(
                  styles.card,
                  styles.cardButton,
                  tone === 'urgent' && styles.toneUrgent,
                  tone === 'attention' && styles.toneAttention,
                  activeQueue === queue && styles.cardActive,
                )}
                aria-pressed={activeQueue === queue}
                onClick={() => onSelect(queue)}
              >
                <span className={styles.cardLabel}>{label(queue)}</span>
                <span className={styles.cardCount}>{fmt.count(count)}</span>
                {hint ? <span className={styles.cardHint}>{hint}</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
