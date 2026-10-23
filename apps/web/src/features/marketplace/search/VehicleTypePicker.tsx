'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { SegmentedTabs } from './SegmentedTabs';
import { useSearchExperience } from './search-context';
import { vehicleItems } from './search-items';

interface VehicleTypePickerProps {
  className?: string;
}

/**
 * Bộ chọn Loại xe (Ô tô / Xe máy) đặt cạnh Địa điểm trong thanh tìm kiếm của trang kết quả.
 *
 * Dựng trên CÙNG `SegmentedTabs` + `vehicleItems` với thẻ tìm kiếm trang chủ, nên:
 *   - nhãn đi qua namespace `Domain` (hai ngôn ngữ) thay vì chữ viết thẳng;
 *   - ngữ nghĩa `radiogroup`/`radio` + roving tabindex + mũi tên giống hệt hero;
 *   - đang ở "Xe có tài xế" thì "Xe máy" biến mất (xe máy không có dịch vụ đó) — cùng một bảng
 *     `vehicleServiceTypesFor` với hero, không thể dựng ra một tổ hợp không tồn tại.
 */
export function VehicleTypePicker({ className }: VehicleTypePickerProps) {
  const t = useTranslations('Marketplace.filterPanel');
  const domainLabel = useDomainLabel();
  const { draft, setVehicleType } = useSearchExperience();
  const items = useMemo(
    () => vehicleItems(domainLabel, draft.serviceType),
    [domainLabel, draft.serviceType],
  );

  return (
    <SegmentedTabs
      value={draft.vehicleType}
      onChange={setVehicleType}
      items={items}
      ariaLabel={t('vehicleType')}
      semantics="radio"
      className={className}
    />
  );
}
