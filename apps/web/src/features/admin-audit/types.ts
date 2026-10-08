import type { components } from '@xeprime/types';

/** Type nhật ký hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AuditLog = Schemas['AuditLogDto'];
export type AuditLogDetail = Schemas['AuditLogDetailDto'];

/** Filter nhật ký — ở URL searchParams (ADR 0004). */
export interface AuditLogFilters {
  /** Ô tìm kiếm: ULID khớp chính xác, chữ khớp tên/email người thực hiện hoặc tên/mã gian hàng. */
  q?: string;
  actorScope?: string;
  /** Nhóm hành động (`AUDIT_ACTION_CATEGORY`) — lọc ở server theo tiền tố mã. */
  category?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  actorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  /**
   * Dòng đang mở trong panel chi tiết (`?open=<id>`) — KHÔNG đi lên API. Nằm ở URL để link từ
   * tab Nhật ký của đối tác mở thẳng đúng dòng, và F5 không đóng panel.
   */
  open?: string;
}
