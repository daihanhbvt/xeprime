'use client';

import { CarOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { VEHICLE_TYPE, type VehicleType } from '@xeprime/types';
import { MotorbikeOutlined } from '@/components/data-display/VehicleTypeIcon';
import { cx } from '@/lib/cx';
import { useSearchExperience } from './search-context';
import styles from './VehicleTypePicker.module.css';

interface VehicleTypePickerProps {
  className?: string;
}

/**
 * Bộ chọn Loại xe (Ô tô / Xe máy) đặt cạnh Địa điểm trong thanh tìm kiếm.
 * Giúp người dùng chuyển đổi tức thì giữa Ô tô và Xe máy với 1 click.
 */
export function VehicleTypePicker({ className }: VehicleTypePickerProps) {
  const t = useTranslations('Marketplace.filterPanel');
  const { draft, setVehicleType } = useSearchExperience();

  const isMotorbike = draft.vehicleType === VEHICLE_TYPE.MOTORBIKE;

  return (
    <div
      role="radiogroup"
      aria-label={t('vehicleType')}
      className={cx(styles.container, className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={!isMotorbike}
        className={cx(styles.tab, !isMotorbike && styles.tabActive)}
        onClick={() => setVehicleType(VEHICLE_TYPE.CAR)}
      >
        <CarOutlined className={styles.icon} aria-hidden />
        <span className={styles.label}>Ô tô</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={isMotorbike}
        className={cx(styles.tab, isMotorbike && styles.tabActive)}
        onClick={() => setVehicleType(VEHICLE_TYPE.MOTORBIKE)}
      >
        <MotorbikeOutlined className={styles.icon} aria-hidden />
        <span className={styles.label}>Xe máy</span>
      </button>
    </div>
  );
}

