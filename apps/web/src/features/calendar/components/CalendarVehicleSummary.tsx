'use client';

import { CarOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './VehicleBlockDialog.module.css';

/** Những gì thẻ xe đầu hộp cần — lấy từ hàng xe của lưới, không gọi thêm endpoint. */
export interface CalendarVehicleInfo {
  name: string;
  plateNumber: string | null;
  imageUrl: string | null;
  weekdayPrice: string | null;
  hourlyPrice: string | null;
}

/**
 * Thẻ xe đầu hộp "Khoá xe" / "Đặt giá riêng" (design `24200:99525`): ảnh · tên + biển số · giá
 * ngày (và giá giờ nếu xe cho thuê giờ) màu vàng. Xe chưa có giá thì dòng giá nói thẳng như vậy.
 */
export function CalendarVehicleSummary({ vehicle }: { vehicle: CalendarVehicleInfo }) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const prices = [
    vehicle.weekdayPrice ? fmt.pricePerDay(vehicle.weekdayPrice) : null,
    vehicle.hourlyPrice ? fmt.pricePerHour(vehicle.hourlyPrice) : null,
  ].filter(Boolean);

  return (
    <div className={styles.vehicle}>
      {vehicle.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
        <img src={vehicle.imageUrl} alt="" className={styles.vehicleImage} />
      ) : (
        <span className={styles.vehicleImageFallback} aria-hidden>
          <CarOutlined />
        </span>
      )}
      <span className={styles.vehicleTexts}>
        <span className={styles.vehicleTitle}>
          <span className={styles.vehicleName}>{vehicle.name}</span>
          {vehicle.plateNumber ? (
            <span className={styles.vehiclePlate}>{vehicle.plateNumber}</span>
          ) : null}
        </span>
        <span className={styles.vehiclePrice}>
          {prices.length ? prices.join(LIST_SEPARATOR) : t('dailyPrice.noDefaultPrice')}
        </span>
      </span>
    </div>
  );
}
