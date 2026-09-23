'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import type { SelectFieldOption } from '@/components/form/SelectField';
import type { DomainGroup } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { ADMIN_VEHICLE_QUICK_FILTERS } from '../constants';

/**
 * Option cho bộ lọc màn "Xe toàn hệ thống" — dựng lúc CHẠY vì nhãn đổi theo ngôn ngữ người xem.
 *
 * Cùng lý do với `useVehicleOptions` ở phía gian hàng: ba danh sách này từng là hằng sinh từ
 * `*_META` của `@xeprime/types`, và một hằng ở module scope được tính đúng MỘT lần cho cả tiến
 * trình — nhãn tiếng Việt dính lại kể cả khi người dùng đang xem tiếng Anh, và ở SSR là rò ngôn
 * ngữ giữa các request. Giá trị (mã đi trên dây) vẫn là hằng; chỉ NHÃN mới động.
 *
 * `@xeprime/types` giữ nguyên `*_VALUES` làm nguồn thứ tự và tính đầy đủ: thêm một status mới ở
 * đó là nó tự xuất hiện ở đây (ADR 0005).
 */
export interface AdminVehicleOptions {
  publicStatus: SelectFieldOption[];
  operationStatus: SelectFieldOption[];
  vehicleType: SelectFieldOption[];
  /** Lối tắt lọc, đã kèm mục "Tất cả" ở đầu. `value` rỗng = không lối tắt nào. */
  quickFilters: { value: string; label: string }[];
}

export function useAdminVehicleOptions(): AdminVehicleOptions {
  const domainLabel = useDomainLabel();
  const t = useTranslations('AdminVehicles.quick');
  const tCommon = useTranslations('Common.labels');

  return useMemo(() => {
    const all = { value: 'all', label: tCommon('all') };
    const from = <T extends string>(values: readonly T[], group: DomainGroup): SelectFieldOption[] =>
      [all, ...values.map((value) => ({ value, label: domainLabel(group, value) }))];

    return {
      publicStatus: from(VEHICLE_PUBLIC_STATUS_VALUES, 'vehiclePublicStatus'),
      operationStatus: from(VEHICLE_OPERATION_STATUS_VALUES, 'vehicleOperationStatus'),
      vehicleType: from(VEHICLE_TYPE_VALUES, 'vehicleType'),
      quickFilters: [
        { value: '', label: tCommon('all') },
        ...ADMIN_VEHICLE_QUICK_FILTERS.map((f) => ({ value: f.key, label: t(f.key) })),
      ],
    };
  }, [domainLabel, t, tCommon]);
}
