'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import {
  HOST_METRIC_STATE,
  HOST_METRIC_WINDOW_DAYS,
  hostMetricState,
  responseSpeedOf,
  type HostMetrics as HostMetricsShape,
} from '@xeprime/types';
import { InfoCard } from '@/components/layout/InfoCard';
import { HostMetrics } from '@/features/marketplace/components/HostMetrics';
import { cx } from '@/lib/cx';
import styles from './ReputationPanel.module.css';

/** Dưới mức này thanh "nhận và giữ" đổi sang cam (bản vẽ: 48% cam, 82% xanh). */
const LOW_PERCENT = 60;

/**
 * "Uy tín của gian hàng" — Figma `24138:80642`: ba dòng chỉ số kèm thanh tiến độ, nhãn "90 ngày
 * qua", câu nhắc cuối. Cùng phép chọn dòng với `ReputationPanel` của app Partner: dưới ngưỡng mẫu
 * (`hostMetricState` ≠ READY) thì rơi về khối `HostMetrics` chung (nó tự nói "chưa đủ dữ liệu"),
 * không bao giờ hiện 0% (ADR 0045 điều 3).
 */
export function ReputationPanel({ metrics }: { metrics: HostMetricsShape | undefined }) {
  const t = useTranslations('Dashboard.reputation');
  const tm = useTranslations('Shops.metrics');

  let body;
  if (!metrics) {
    body = <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  } else if (hostMetricState(metrics.sampleCount) !== HOST_METRIC_STATE.READY) {
    body = <HostMetrics metrics={metrics} />;
  } else {
    const rows: { key: string; label: string; value: string; percent: number | null }[] = [];
    if (metrics.responseRatePercent !== null) {
      rows.push({
        key: 'responseRate',
        label: tm('responseRate'),
        value: tm('responseRateValue', { percent: metrics.responseRatePercent }),
        percent: metrics.responseRatePercent,
      });
    }
    const speed = responseSpeedOf(metrics.responseMinutesMedian);
    if (speed !== null) {
      rows.push({
        key: 'responseTime',
        label: tm('responseTime'),
        value: tm(`speed.${speed}`),
        percent: null,
      });
    } else if (metrics.instantBook) {
      rows.push({
        key: 'instant',
        label: tm('responseTime'),
        value: tm('instantBook'),
        percent: null,
      });
    } else {
      // Chưa có lượt duyệt tay nào trong cửa sổ: vẫn giữ dòng, nói "chưa có dữ liệu" - không bao giờ "0 phút".
      rows.push({
        key: 'responseTime',
        label: tm('responseTime'),
        value: t('responseTimeEmpty'),
        percent: null,
      });
    }
    if (metrics.acceptKeepRatePercent !== null) {
      rows.push({
        key: 'acceptKeep',
        label: tm('acceptKeep'),
        value: tm('acceptKeepValue', { percent: metrics.acceptKeepRatePercent }),
        percent: metrics.acceptKeepRatePercent,
      });
    }
    body = (
      <div className={styles.rows}>
        {rows.map((row) => {
          const low = row.percent !== null && row.percent < LOW_PERCENT;
          return (
            <div key={row.key} className={styles.metric}>
              <div className={styles.metricHead}>
                <span className={styles.label}>{row.label}</span>
                <span className={cx(styles.value, low && styles.valueLow)}>{row.value}</span>
              </div>
              {row.percent !== null ? (
                <span className={styles.track} aria-hidden="true">
                  <span
                    className={cx(styles.fill, low && styles.fillLow)}
                    style={
                      { '--fill': `${Math.max(0, Math.min(100, row.percent))}%` } as CSSProperties
                    }
                  />
                </span>
              ) : null}
            </div>
          );
        })}
        <p className={styles.note}>{t('note')}</p>
      </div>
    );
  }

  return (
    <InfoCard
      title={t('title')}
      extra={
        <span className={styles.window}>{t('window', { days: HOST_METRIC_WINDOW_DAYS })}</span>
      }
    >
      {body}
    </InfoCard>
  );
}
