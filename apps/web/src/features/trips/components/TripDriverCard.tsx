'use client';

import { PhoneOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DRIVER_INCIDENT_LEVEL, SERVICE_TYPE, canCustomerCancelTrip } from '@xeprime/types';
import { SUPPORT_HOTLINE } from '@/constants/contact';
import { telHref } from '@/lib/contact';
import type { CustomerTripDetail } from '../types';
import { CancelTripDialog } from './CancelTripDialog';
import layout from './TripRequestLayout.module.css';
import styles from './TripDriverCard.module.css';

/**
 * "Tài xế" trên trang chuyến của KHÁCH khi chuyến có tài xế và đã có đơn (ADR 0067 · ADR 0074):
 * người sẽ đến đón — gọi được ngay. Chưa có ai thì nói "Đang sắp xếp tài xế".
 *
 * Tài xế đã nhận rồi rút (`driverIncident`) — khách KHÔNG biết ai đã rút, chỉ thấy mức điều phối:
 * sắp xếp / điều phối lại / sự cố sát giờ (kèm tổng đài). Khi server báo `freeCancel` (quá hạn điều
 * phối hoặc còn dưới 2 giờ) thì có nút huỷ hoàn 100% — cùng hộp huỷ của trang chuyến, con số do
 * server xem trước. Ai được hiện cho ai do SERVER quyết.
 */
export function TripDriverCard({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.detail');
  const [cancelOpen, setCancelOpen] = useState(false);
  if (trip.serviceType !== SERVICE_TYPE.WITH_DRIVER || !trip.bookingId) return null;
  const driver = trip.driver ?? null;
  const incident = trip.driverIncident ?? null;
  const tel = driver ? telHref(driver.phone) : null;
  const canFreeCancel = Boolean(incident?.freeCancel) && canCustomerCancelTrip(trip.stage);

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
      ) : incident?.level === DRIVER_INCIDENT_LEVEL.URGENT ? (
        <Alert
          type="warning"
          showIcon
          title={t('driverIncident.urgentTitle')}
          description={t.rich('driverIncident.urgentBody', {
            phone: SUPPORT_HOTLINE.display,
            tel: (chunks) => <a href={`tel:${SUPPORT_HOTLINE.tel}`}>{chunks}</a>,
          })}
        />
      ) : (
        <p className={layout.cardLead}>
          {incident?.level === DRIVER_INCIDENT_LEVEL.REARRANGING
            ? t('driverIncident.rearranging')
            : t('driverArranging')}
        </p>
      )}

      {canFreeCancel ? (
        <div className={styles.incidentCancel}>
          <p className={styles.phone}>{t('driverIncident.freeCancelHint')}</p>
          <Button danger onClick={() => setCancelOpen(true)}>
            {t('driverIncident.freeCancel')}
          </Button>
        </div>
      ) : null}

      {/* Dựng có điều kiện: mỗi lần mở là một hộp mới với bản xem trước mới của server. */}
      {cancelOpen ? (
        <CancelTripDialog trip={trip} open onClose={() => setCancelOpen(false)} />
      ) : null}
    </section>
  );
}
