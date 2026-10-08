import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import type { VehicleSort } from './api';

/**
 * Cách sắp xếp danh sách xe — MỘT nguồn cho danh sách xe của gian hàng (`VehicleListScreen`) và
 * khu tài khoản (`AccountVehiclesScreen`).
 *
 * Khớp `VEHICLE_SORT` ở backend DTO và `options.sort` bên web — năm giá trị, không nhiều hơn.
 */
export const VEHICLE_SORT = {
  NEWEST: 'newest',
  NAME_ASC: 'name_asc',
  CODE_ASC: 'code_asc',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
} as const satisfies Record<string, VehicleSort>;

export const VEHICLE_SORT_VALUES: readonly VehicleSort[] = Object.values(VEHICLE_SORT);

/** Web: `value={filters.sort ?? 'newest'}`. */
export const DEFAULT_VEHICLE_SORT: VehicleSort = VEHICLE_SORT.NEWEST;

/**
 * Nhãn của một cách sắp xếp (`Vehicles.list.sort.*`). Liệt kê tường minh — khoá i18n ghép động
 * lọt qua typecheck của `use-intl`.
 */
export function useVehicleSortLabel(): (sort: VehicleSort) => string {
  const t = useTranslations('Vehicles.list.sort');
  return useCallback(
    (sort: VehicleSort) => {
      switch (sort) {
        case VEHICLE_SORT.NAME_ASC:
          return t('name_asc');
        case VEHICLE_SORT.CODE_ASC:
          return t('code_asc');
        case VEHICLE_SORT.PRICE_ASC:
          return t('price_asc');
        case VEHICLE_SORT.PRICE_DESC:
          return t('price_desc');
        default:
          return t('newest');
      }
    },
    [t],
  );
}
