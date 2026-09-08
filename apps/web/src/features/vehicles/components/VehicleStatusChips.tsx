'use client';

import { useTranslations } from 'next-intl';
import type { SelectFieldOption } from '@/components/form/SelectField';
import { useVehicleOptions } from '../hooks/use-vehicle-options';
import styles from './VehicleStatusChips.module.css';

interface VehicleStatusChipsProps {
  /** Giá trị `operationStatus` đang lọc — `undefined` = Tất cả. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /**
   * Bộ lựa chọn khác trạng thái vận hành (vd dịch vụ ở `/account/vehicles`). Mặc định là
   * trạng thái vận hành — hành vi cũ của `/manage/vehicles` không đổi.
   */
  options?: readonly SelectFieldOption[];
  /** Tên nhóm cho trình đọc màn hình khi `options` không phải trạng thái vận hành. */
  ariaLabel?: string;
}

/**
 * Hàng chip lọc trạng thái vận hành ở mobile — Figma `236:4663` (`mobile-vehicle-list-v2`).
 *
 * Cùng một filter URL với dropdown "Vận hành" trong `FilterBar` (ADR 0004) — đây chỉ là lối
 * vào một-chạm cho bộ lọc dùng nhiều nhất, không phải một state thứ hai. Cuộn ngang một hàng,
 * không wrap; nhãn lấy từ `Domain.vehicleOperationStatus` (ADR 0005).
 */
export function VehicleStatusChips({
  value,
  onChange,
  options: customOptions,
  ariaLabel,
}: VehicleStatusChipsProps) {
  const t = useTranslations('Vehicles.list.statusChips');
  const tCommon = useTranslations('Common.labels');
  const { operationStatus } = useVehicleOptions();

  const options = [{ value: '', label: tCommon('all') }, ...(customOptions ?? operationStatus)];

  return (
    <div className={styles.row} role="group" aria-label={ariaLabel ?? t('ariaLabel')}>
      {options.map((option) => {
        const active = (value ?? '') === option.value;
        return (
          <button
            key={option.value || 'all'}
            type="button"
            className={active ? `${styles.chip} ${styles.active}` : styles.chip}
            aria-pressed={active}
            onClick={() => onChange(option.value || undefined)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
