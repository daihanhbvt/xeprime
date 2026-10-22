'use client';

import { PhoneOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE } from '@xeprime/types';
import { telHref } from '@/lib/contact';
import type { CustomerTripDetail } from '../types';
import layout from './TripRequestLayout.module.css';
import styles from './TripDriverCard.module.css';

/**
 * "Tài xế" trên trang chuyến của KHÁCH khi chuyến có tài xế và đã có đơn (ADR 0067): người sẽ đến
 * đón — tài xế liên kết đã nhận hay tài xế ngoài hệ thống — cùng một hình, gọi được ngay. Chưa có
 * ai thì nói "Đang sắp xếp tài xế". Ai được hiện cho ai do SERVER quyết (`driver` của chuyến);
 * chuyến không phải có tài xế, hay chưa có đơn, thì khối im lặng.
 */
export function TripDriverCard({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.detail');
  if (trip.serviceType !== SERVICE_TYPE.WITH_DRIVER || !trip.bookingId) return null;
  const driver = trip.driver ?? null;
  const tel = driver ? telHref(driver.phone) : null;

  return (
    <section className={layout.card}>
      <h2 className={layout.cardTitle}>{t('driver')}</h2>
      {driver ? (
        <div className={styles.row}>
          <div className={styles.identity}>
            <span className={styles.name}>{driver.name}</span>
            <span className={styles.phone}>{driver.phone}</span>
          </div>
          {tel ? (
            <a
              href={tel}
              className={styles.call}
              aria-label={t('driverCall', { name: driver.name })}
              title={t('driverCall', { name: driver.name })}
            >
              <PhoneOutlined aria-hidden />
            </a>
          ) : null}
        </div>
      ) : (
        <p className={layout.cardLead}>{t('driverArranging')}</p>
      )}
    </section>
  );
}
