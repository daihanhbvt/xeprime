'use client';

import { AUDIT_ACTION_CATEGORY_VALUES } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { ADMIN_AUDIT_OPEN_PARAM } from '@/constants/routes';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AuditLogFilters } from '../types';

/**
 * Filter nhật ký ở URL searchParams (ADR 0004). Mặc định xem tất cả, mới nhất trước.
 *
 * Dời sang `useUrlFilters` ở Wave 1C-D. Hành vi giữ nguyên: bản copy cũ cũng xoá
 * `undefined`/`null`/`''`/`'all'` và cũng reset trang khi đổi filter. Hook chung xoá thêm `false`,
 * nhưng nhật ký không có filter boolean nào nên không có khác biệt nào phát sinh.
 *
 * `open` là dòng đang mở trong panel — tham số giao diện, đặt với `resetPage: false`.
 */
export function useAuditFilters() {
  return useUrlFilters<AuditLogFilters>((sp) => ({
    q: sp.get('q')?.trim() || undefined,
    actorScope: sp.get('actorScope') ?? 'all',
    // Nhóm lạ trong URL (link cũ, gõ tay) rơi về "tất cả" thay vì thành lỗi 400 từ server.
    category: (AUDIT_ACTION_CATEGORY_VALUES as readonly string[]).includes(sp.get('category') ?? '')
      ? (sp.get('category') as string)
      : ALL_FILTER,
    action: sp.get('action') ?? 'all',
    targetType: sp.get('targetType') ?? 'all',
    targetId: sp.get('targetId') ?? undefined,
    tenantId: sp.get('tenantId') ?? undefined,
    actorUserId: sp.get('actorUserId') ?? undefined,
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    open: sp.get(ADMIN_AUDIT_OPEN_PARAM)?.trim() || undefined,
  }));
}
