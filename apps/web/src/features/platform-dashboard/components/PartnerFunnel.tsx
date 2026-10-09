'use client';

import { FunnelPlotOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { useAppFormat } from '@/i18n/use-app-format';
import type { PlatformDashboardFunnel } from '../types';
import styles from './PlatformDashboardView.module.css';

/** Thứ tự các bậc — mỗi bậc là tập con của bậc trước (server bảo đảm). */
const STAGES = ['registered', 'withVehicle', 'withListing', 'withBooking', 'withCompletedTrip'] as const;

/**
 * Phễu kích hoạt đối tác: đăng ký → có xe → có xe trên chợ → có đơn → hoàn thành chuyến
 * (`docs/design/03_PRODUCT_GAP_ANALYSIS.md` — "dashboard funnel").
 *
 * Thanh dài theo tỉ lệ với bậc ĐẦU (để nhìn ra phễu hẹp dần), còn con số "% bước trước" nói chỗ
 * nào rơi nhiều nhất — đó mới là câu người vận hành hỏi ("đăng xe xong mà không lên được chợ?").
 * Độ dài thanh là giá trị chỉ biết lúc chạy ⇒ CSS custom property, ngoại lệ duy nhất của ADR 0003.
 */
export function PartnerFunnel({ funnel }: { funnel: PlatformDashboardFunnel | undefined }) {
  const t = useTranslations('PlatformDashboard.funnel');
  const fmt = useAppFormat();

  let body;
  if (!funnel) {
    body = <Skeleton active title={false} paragraph={{ rows: 5 }} />;
  } else if (funnel.registered === 0) {
    body = <p className={styles.muted}>{t('empty')}</p>;
  } else {
    body = (
      <ol className={styles.funnel}>
        {STAGES.map((stage, index) => {
          const value = funnel[stage];
          const previous = index > 0 ? funnel[STAGES[index - 1]!] : null;
          const width = Math.max(2, Math.round((value / funnel.registered) * 100));
          const ofPrevious =
            previous === null || previous === 0 ? null : Math.round((value / previous) * 100);
          return (
            <li key={stage} className={styles.funnelRow}>
              <div className={styles.funnelHead}>
                <span className={styles.funnelLabel}>{t(stage)}</span>
                <span className={styles.funnelValue}>{fmt.count(value)}</span>
              </div>
              <div className={styles.funnelTrack}>
                <span
                  className={styles.funnelBar}
                  style={{ '--xp-bar-width': `${width}%` } as CSSProperties}
                />
              </div>
              {ofPrevious !== null ? (
                <span className={styles.funnelConversion}>{t('ofPrevious', { percent: ofPrevious })}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <DashboardPanel title={t('title')} icon={<FunnelPlotOutlined />}>
      <p className={styles.panelDescription}>{t('description')}</p>
      {body}
    </DashboardPanel>
  );
}
