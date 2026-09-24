'use client';

import {
  APPROVAL_STATUS_VALUES,
  STOREFRONT_KIND_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { DAY_PARAM_FORMAT, dayjs } from '@/lib/datetime';
import { VEHICLE_APPROVALS_DEFAULT_STATUS } from '../api';
import { APPROVAL_STATUS_ANY } from '../constants';
import type { VehicleApprovalFilters } from '../types';

/** Bộ lọc + phiếu đang mở của màn "Duyệt xe". */
export interface VehicleApprovalUrlState extends VehicleApprovalFilters {
  /**
   * Phiếu đang mở trong drawer. Sống ở URL để F5 không đóng mất hồ sơ đang xem dở, và để một
   * người duyệt gửi được đúng chiếc xe cho người khác bằng một đường link.
   */
  task?: string;
}

/** Các khoá mà `FilterBar` điều khiển — đều là chuỗi, nên đi qua được `FilterValues` không cần ép kiểu. */
const FILTER_BAR_KEYS = ['q', 'storefrontKind', 'status', 'submittedFrom', 'submittedTo'] as const;

type FilterBarKey = (typeof FILTER_BAR_KEYS)[number];

/** State URL → giá trị cho `FilterBar`. */
export function filterBarValues(
  state: VehicleApprovalUrlState,
): Record<FilterBarKey, string | undefined> {
  return {
    q: state.q,
    storefrontKind: state.storefrontKind,
    status: state.status,
    submittedFrom: state.submittedFrom,
    submittedTo: state.submittedTo,
  };
}

/** Patch của `FilterBar` → patch state URL; khoá lạ (không thuộc bộ lọc này) bị bỏ qua. */
export function filterBarPatch(
  patch: Readonly<Record<string, string | undefined>>,
): Partial<VehicleApprovalUrlState> {
  const out: Partial<VehicleApprovalUrlState> = {};
  for (const key of FILTER_BAR_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out;
}

function oneOf(value: string | null, allowed: readonly string[]): string | undefined {
  return value !== null && allowed.includes(value) ? value : undefined;
}

function dayParam(value: string | null): string | undefined {
  return value && dayjs(value, DAY_PARAM_FORMAT, true).isValid() ? value : undefined;
}

/**
 * Bộ lọc ở URL searchParams (ADR 0004) — chia sẻ được, sống qua F5 và nút Back.
 *
 * Giá trị LẠ trong URL (gõ tay, link cũ) rơi về mặc định thay vì được gửi nguyên lên server: một
 * `vehicleType=abc` sẽ là một lỗi 400 và một màn hình đỏ cho một thứ người dùng không hề gõ.
 */
export function useVehicleApprovalFilters() {
  return useUrlFilters<VehicleApprovalUrlState>((sp) => ({
    status:
      oneOf(sp.get('status'), [...APPROVAL_STATUS_VALUES, APPROVAL_STATUS_ANY]) ??
      VEHICLE_APPROVALS_DEFAULT_STATUS,
    vehicleType: oneOf(sp.get('vehicleType'), VEHICLE_TYPE_VALUES) ?? ALL_FILTER,
    storefrontKind: oneOf(sp.get('storefrontKind'), STOREFRONT_KIND_VALUES) ?? ALL_FILTER,
    q: sp.get('q')?.trim() || undefined,
    submittedFrom: dayParam(sp.get('submittedFrom')),
    submittedTo: dayParam(sp.get('submittedTo')),
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
    task: sp.get('task') ?? undefined,
  }));
}
