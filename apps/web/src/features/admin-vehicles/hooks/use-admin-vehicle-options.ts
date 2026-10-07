'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  PLATFORM_VEHICLE_SORT_VALUES,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import type { SelectFieldOption } from '@/components/form/SelectField';
import { ALL_FILTER } from '@/constants/filters';
import type { DomainGroup } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Option cho bộ lọc màn "Xe toàn hệ thống" — dựng lúc CHẠY vì nhãn đổi theo ngôn ngữ người xem.
 *
 * Cùng lý do với `useVehicleOptions` ở phía gian hàng: các danh sách này từng là hằng sinh từ
 * `*_META` của `@xeprime/types`, và một hằng ở module scope được tính đúng MỘT lần cho cả tiến
 * trình — nhãn tiếng Việt dính lại kể cả khi người dùng đang xem tiếng Anh, và ở SSR là rò ngôn
 * ngữ giữa các request. Giá trị (mã đi trên dây) vẫn là hằng; chỉ NHÃN mới động.
 *
 * `@xeprime/types` giữ nguyên `*_VALUES` làm nguồn thứ tự và tính đầy đủ: thêm một status mới ở
 * đó là nó tự xuất hiện ở đây (ADR 0005). Tỉnh/thành KHÔNG ở đây: danh sách đó đến từ server
 * (`useProvinceOptions`).
 */
export interface AdminVehicleOptions {
  publicStatus: SelectFieldOption[];
  operationStatus: SelectFieldOption[];
  vehicleType: SelectFieldOption[];
  serviceType: SelectFieldOption[];
  /** Không có mục "Tất cả": ô Sắp xếp luôn có một giá trị. */
  sort: SelectFieldOption[];
}

export function useAdminVehicleOptions(): AdminVehicleOptions {
  const domainLabel = useDomainLabel();
  const tCommon = useTranslations('Common.labels');

  return useMemo(() => {
    const all = { value: ALL_FILTER, label: tCommon('all') };
    const from = <T extends string>(values: readonly T[], group: DomainGroup): SelectFieldOption[] =>
      [all, ...values.map((value) => ({ value, label: domainLabel(group, value) }))];

    return {
      publicStatus: from(VEHICLE_PUBLIC_STATUS_VALUES, 'vehiclePublicStatus'),
      operationStatus: from(VEHICLE_OPERATION_STATUS_VALUES, 'vehicleOperationStatus'),
      vehicleType: from(VEHICLE_TYPE_VALUES, 'vehicleType'),
      serviceType: from(SERVICE_TYPE_VALUES, 'serviceType'),
      sort: PLATFORM_VEHICLE_SORT_VALUES.map((value) => ({
        value,
        label: domainLabel('platformVehicleSort', value),
      })),
    };
  }, [domainLabel, tCommon]);
}
