'use client';

import { useTranslations } from 'next-intl';

import { ServiceTypeChips } from '@/features/vehicles/components/ServiceTypeChips';
import type { VehicleDetail } from '@/features/vehicles/types';

import { useServiceToggle } from '../hooks/use-service-toggle';
import styles from './VehicleServiceChips.module.css';

/**
 * Ô "Loại dịch vụ" của màn SỬA xe (30/09/2026) — nhãn bấm là LƯU NGAY.
 *
 * Đi qua CÙNG `useServiceToggle` với công tắc trên menu trái: gửi đủ mảng `serviceTypes`, không
 * bao giờ rỗng, hỏi lại khi tắt một dịch vụ đang có giá riêng. Hai chỗ bấm, MỘT đường ghi — form
 * Thông tin xe vẫn không gửi `serviceTypes`, nên lưu form không ghi đè lần bật/tắt ở đây.
 */
export function VehicleServiceChips({
  vehicle,
  canEdit,
}: {
  vehicle: VehicleDetail;
  /** `vehicles.update` ∧ ngoài phiên hỗ trợ — bật/tắt dịch vụ là quyết định của chủ xe. */
  canEdit: boolean;
}) {
  const t = useTranslations('Vehicles.form.basic');
  const toggle = useServiceToggle(vehicle, canEdit);

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t('serviceTypes')}</span>
      <ServiceTypeChips
        value={vehicle.serviceTypes ?? []}
        vehicleType={vehicle.vehicleType}
        disabled={!canEdit || toggle.pending}
        blockedReason={toggle.blockedReason}
        onToggle={toggle.toggle}
        ariaLabel={t('serviceTypes')}
      />
      <span className={styles.help}>{t('serviceTypesHelp')}</span>
      {toggle.dialog}
    </div>
  );
}
