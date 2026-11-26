'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { cx } from '@/lib/cx';
import { serviceTone, type ServiceTone } from '../utils/calendar-event-model';
import styles from './CalendarScheduler.module.css';

const TONE_CLASS: Record<ServiceTone, string | undefined> = {
  selfDrive: styles.toneSelfDrive,
  withDriver: styles.toneWithDriver,
  longTerm: styles.toneLongTerm,
  neutral: styles.toneNeutral,
};

const LEGEND_SERVICES: readonly ServiceType[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
  SERVICE_TYPE.LONG_TERM,
];

/**
 * Dải "CHÚ THÍCH" đầu thẻ lịch (design `24200:103941`): ba sắc DỊCH VỤ của thẻ đơn · Khoá/Bảo dưỡng ·
 * Giá riêng · Ngày lễ. Sắc ô mẫu dùng CHÍNH class tông của thẻ đơn (`toneSelfDrive`…) nên chú thích
 * không thể nói một màu khác với lưới.
 *
 * Nhóm "Đơn thuê xe" (chip trên thẻ) không vào chú thích: chip đã có chữ.
 */
export function CalendarLegend() {
  const t = useTranslations('Calendar');

  return (
    <div className={styles.legend} aria-label={t('legend.ariaLabel')}>
      <p className={styles.legendTitle}>{t('legend.title')}</p>
      {LEGEND_SERVICES.map((service) => (
        <span key={service} className={styles.legendItem}>
          <i className={cx(styles.legendSwatch, TONE_CLASS[serviceTone(service)])} aria-hidden />
          {t(`legend.service.${service}`)}
        </span>
      ))}
      <span className={styles.legendItem}>
        <i className={cx(styles.legendSwatch, styles.legendSwatchOff)} aria-hidden />
        {t('legend.off')}
      </span>
      <span className={styles.legendItem}>
        <i className={cx(styles.legendSwatch, styles.legendSwatchPrice)} aria-hidden />
        {t('legend.customPrice')}
      </span>
      <span className={styles.legendItem}>
        <i className={cx(styles.legendSwatch, styles.legendSwatchHoliday)} aria-hidden />
        {t('legend.holiday')}
      </span>
      {/* Hai dấu trên thẻ đơn (ADR 0110): nguồn đơn và thanh toán. */}
      <span className={styles.legendItem}>
        <i className={styles.sourceMark} aria-hidden>
          {t('legend.direct').charAt(0)}
        </i>
        {t('legend.direct')}
      </span>
      <span className={styles.legendItem}>
        <CheckCircleFilled className={styles.paidFull} aria-hidden />
        {t('legend.paidFull')}
      </span>
    </div>
  );
}
