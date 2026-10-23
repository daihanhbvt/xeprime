import type { components } from '@xeprime/types';

/** Type tab "Cần chăm sóc" lấy từ contract OpenAPI (ADR 0007 · ADR 0070). */
type Schemas = components['schemas'];

export type FollowUp = Schemas['PlatformFollowUpDto'];
export type UpdateFollowUpInput = Schemas['UpdateFollowUpDto'];
export type FollowUpContact = Schemas['FollowUpContactDto'];
export type FollowUpAssignee = Schemas['FollowUpAssigneeDto'];

/** Bộ lọc + mục đang mở — ở URL searchParams (ADR 0004). */
export interface FollowUpFilters {
  q?: string;
  phone?: string;
  reason?: string;
  followUpStatus?: string;
  mine?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  /** Mục đang mở trong panel. */
  open?: string;
}
