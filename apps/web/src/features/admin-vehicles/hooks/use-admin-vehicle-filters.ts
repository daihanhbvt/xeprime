'use client';

import {
  DEFAULT_PLATFORM_VEHICLE_SORT,
  SERVICE_TYPE_VALUES,
  TENANT_STATUS_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
  isPlatformVehicleSort,
} from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { ADMIN_VEHICLE_OPEN_PARAM } from '@/constants/routes';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminVehicleUrlState } from '../types';

/** Trần `limit` của `GET /platform/vehicles` (`PLATFORM_VEHICLE_MAX_LIMIT`) — vượt thì API trả 400. */
const MAX_LIMIT = 100;

/** Hai giá trị hợp lệ của chiều "hiển thị hiệu lực" trên URL — backend ép sang boolean. */
const VISIBLE_VALUES = ['true', 'false'] as const;

/** Các khoá mà `FilterBar` điều khiển — đều là chuỗi, đi qua được `FilterValues` không cần ép kiểu. */
const FILTER_BAR_KEYS = [
  'q',
  'vehicleType',
  'serviceType',
  'provinceCode',
  'publicStatus',
  'operationStatus',
  'sort',
] as const;

/** Patch của `FilterBar` → patch state URL; khoá lạ bị bỏ qua, `sort` lạ hoặc mặc định thì XOÁ tham số. */
export function filterBarPatch(
  patch: Readonly<Record<string, string | undefined>>,
): Partial<AdminVehicleUrlState> {
  const out: Partial<AdminVehicleUrlState> = {};
  for (const key of FILTER_BAR_KEYS) {
    if (!(key in patch)) continue;
    if (key === 'sort') {
      // Sort mặc định thì XOÁ tham số thay vì ghi `?sort=newest` — URL trần vẫn là trạng thái mặc định.
      out.sort =
        isPlatformVehicleSort(patch.sort) && patch.sort !== DEFAULT_PLATFORM_VEHICLE_SORT
          ? patch.sort
          : undefined;
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}

/**
 * Bộ lọc, sắp xếp, trang và xe đang mở của màn "Xe toàn hệ thống" — toàn bộ ở URL searchParams
 * (ADR 0004): chia sẻ được, sống qua F5 và nút Back. Mặc định xem tất cả.
 *
 * Giá trị LẠ trong URL (gõ tay, link cũ) rơi về mặc định thay vì được gửi nguyên lên server: một
 * `publicStatus=abc` sẽ là lỗi 400 và một màn đỏ cho thứ người dùng không hề gõ. Mã tỉnh không
 * kiểm ở đây (danh sách tỉnh đến từ server); mã lạ chỉ cho một danh sách rỗng, không phải 400.
 */
export function useAdminVehicleFilters() {
  return useUrlFilters<AdminVehicleUrlState>((sp) => {
    const sort = sp.get('sort');
    const limit = positiveIntParam(sp, 'limit');
    return {
      q: sp.get('q')?.trim() || undefined,
      tenantId: sp.get('tenantId')?.trim() || undefined,
      publicStatus: enumParam(sp, 'publicStatus', VEHICLE_PUBLIC_STATUS_VALUES) ?? ALL_FILTER,
      operationStatus:
        enumParam(sp, 'operationStatus', VEHICLE_OPERATION_STATUS_VALUES) ?? ALL_FILTER,
      vehicleType: enumParam(sp, 'vehicleType', VEHICLE_TYPE_VALUES) ?? ALL_FILTER,
      serviceType: enumParam(sp, 'serviceType', SERVICE_TYPE_VALUES) ?? ALL_FILTER,
      provinceCode: sp.get('provinceCode')?.trim() || ALL_FILTER,
      tenantStatus: enumParam(sp, 'tenantStatus', TENANT_STATUS_VALUES) ?? ALL_FILTER,
      marketplaceVisible: enumParam(sp, 'marketplaceVisible', VISIBLE_VALUES) ?? ALL_FILTER,
      sort:
        isPlatformVehicleSort(sort) && sort !== DEFAULT_PLATFORM_VEHICLE_SORT ? sort : undefined,
      page: positiveIntParam(sp, 'page'),
      limit: limit !== undefined && limit <= MAX_LIMIT ? limit : undefined,
      open: sp.get(ADMIN_VEHICLE_OPEN_PARAM)?.trim() || undefined,
    };
  });
}
