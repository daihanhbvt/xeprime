'use client';

import { ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  TRIP_HANDOVER_SOON_HOURS,
  TRIP_HOLD_URGENT_MINUTES,
  TRIP_REQUEST_URGENT_MINUTES,
  tripUrgency,
} from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { cx } from '@/lib/cx';
import { timeDistance } from '../trip-time';
import styles from './TripDeadline.module.css';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * "Bây giờ" nhích mỗi phút — đủ cho nhãn "còn 3 giờ"/"quá 12 phút" đổi kịp mà không bắt cả bảng
 * render lại từng giây (đồng hồ giây là việc của `Countdown`, chỉ ở những dòng có hạn tính phút).
 */
export function useNow(intervalMs: number = MINUTE_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Hạn TRẢ LỜI của chủ xe — đồng hồ m:ss, đổi sắc thái ở đúng mốc nhắc cuối của worker. */
export function RespondByCountdown({ deadline }: { deadline: string }) {
  const t = useTranslations('AdminTrips.request');
  return (
    <Countdown
      deadline={deadline}
      urgentMs={TRIP_REQUEST_URGENT_MINUTES * MINUTE_MS}
      labels={{ remaining: t('remaining'), expired: t('expired') }}
    />
  );
}

/** Hạn GIỮ CHỖ của khách — hai chặng 60′ như đồng hồ khách đang nhìn (ADR 0032 điều 2). */
export function HoldCountdown({ deadline }: { deadline: string }) {
  const t = useTranslations('AdminTrips.request');
  return (
    <Countdown
      deadline={deadline}
      urgentMs={TRIP_HOLD_URGENT_MINUTES * MINUTE_MS}
      segmentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * MINUTE_MS}
      labels={{
        remaining: t('remaining'),
        expired: t('expired'),
        segment: (index, total) => t('segment', { index, total }),
      }}
    />
  );
}

/**
 * Giờ giao/trả xe so với bây giờ — chip "còn 3 giờ" / "quá 2 giờ". Ba sắc thái = ba tình
 * huống: quá giờ (đỏ — việc hỏng), sắp tới (cam — để mắt), còn xa (trung tính). Nền + viền cùng
 * tông, không chỉ đổi màu chữ (UX §8).
 */
export function HandoverDistance({ at, now }: { at: string; now: number }) {
  const t = useTranslations('AdminTrips.time');
  const distance = timeDistance(at, now);
  const urgency = tripUrgency(distance.remainingMs, {
    urgentMs: 0,
    soonMs: TRIP_HANDOVER_SOON_HOURS * HOUR_MS,
  });
  const key = `${distance.direction === 'past' ? 'late' : 'in'}${capitalize(distance.unit)}` as
    | 'inMinutes'
    | 'inHours'
    | 'inDays'
    | 'lateMinutes'
    | 'lateHours'
    | 'lateDays';

  return (
    <span
      className={cx(
        styles.chip,
        urgency === 'overdue' && styles.overdue,
        urgency === 'soon' && styles.soon,
      )}
    >
      {urgency === 'overdue' ? (
        <ExclamationCircleOutlined aria-hidden />
      ) : (
        <ClockCircleOutlined aria-hidden />
      )}
      {t(key, { count: distance.count })}
    </span>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
