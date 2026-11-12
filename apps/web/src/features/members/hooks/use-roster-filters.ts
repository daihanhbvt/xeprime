'use client';

import { MEMBER_ROSTER_STATUS_VALUES, TENANT_ROLE_VALUES } from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { RosterFilters } from '../types';

/** Giá trị lạ trong URL (link cũ, gõ tay) rơi về "tất cả" thay vì thành lỗi 400 từ server. */
function oneOf(values: readonly string[], raw: string | null): string | undefined {
  return raw && values.includes(raw) ? raw : undefined;
}

/**
 * Bộ lọc màn Nhân viên & phân quyền trên URL (ADR 0004) — trước đây là state cục bộ, mất sau F5 và
 * không gửi link được. `open` là dòng đang mở ở ngăn chi tiết (tham số giao diện).
 */
export function useRosterFilters() {
  return useUrlFilters<RosterFilters & { open?: string }>((sp) => ({
    q: sp.get('q')?.trim() || undefined,
    roleKey: oneOf(TENANT_ROLE_VALUES, sp.get('roleKey')),
    status: oneOf(MEMBER_ROSTER_STATUS_VALUES, sp.get('status')),
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
    open: sp.get('open')?.trim() || undefined,
  }));
}
