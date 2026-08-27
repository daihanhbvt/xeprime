import type { components } from '@xeprime/types';

/** Type nhật ký hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AuditLog = Schemas['AuditLogDto'];
export type AuditLogDetail = Schemas['AuditLogDetailDto'];

/** Filter nhật ký — ở URL searchParams (ADR 0004). */
export interface AuditLogFilters {
  actorScope?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  actorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
