'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import type { SelectFieldOption } from '@/components/form/SelectField';
import type { DomainGroup } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { VEHICLE_SORT_VALUES } from '../constants';
import type { VehicleSort } from '../types';

/**
 * Option cho các ô chọn của Fleet — dựng lúc CHẠY vì nhãn đổi theo ngôn ngữ người xem.
 *
 * Trước đây năm danh sách này là hằng ở `constants.ts`, sinh từ `*_LABEL`/`*_META` của
 * `@xeprime/types`. Hằng ở module scope được tính đúng MỘT lần cho cả tiến trình, nên nhãn
 * tiếng Việt trong đó sẽ dính lại kể cả khi người dùng đang xem tiếng Anh — và ở SSR còn là
 * rò ngôn ngữ giữa các request. Giá trị (mã đi trên dây) vẫn là hằng; chỉ NHÃN mới động.
 *
 * `@xeprime/types` giữ nguyên `*_VALUES` làm nguồn thứ tự và tính đầy đủ: thêm một status mới
 * ở đó là nó tự xuất hiện ở đây, chỉ cần khai báo nhãn trong `messages/<locale>/domain.json`.
 */
export interface VehicleOptions {
  vehicleType: SelectFieldOption[];
  serviceType: SelectFieldOption[];
  operationStatus: SelectFieldOption[];
  publicStatus: SelectFieldOption[];
  sort: { value: VehicleSort; label: string }[];
}

export function useVehicleOptions(): VehicleOptions {
  const domainLabel = useDomainLabel();
  const t = useTranslations('Vehicles.list.sort');

  return useMemo(() => {
    const from = <T extends string>(values: readonly T[], group: DomainGroup): SelectFieldOption[] =>
      values.map((value) => ({ value, label: domainLabel(group, value) }));

    return {
      vehicleType: from(VEHICLE_TYPE_VALUES, 'vehicleType'),
      serviceType: from(SERVICE_TYPE_VALUES, 'serviceType'),
      operationStatus: from(VEHICLE_OPERATION_STATUS_VALUES, 'vehicleOperationStatus'),
      publicStatus: from(VEHICLE_PUBLIC_STATUS_VALUES, 'vehiclePublicStatus'),
      sort: VEHICLE_SORT_VALUES.map((value) => ({ value, label: t(value) })),
    };
  }, [domainLabel, t]);
}
