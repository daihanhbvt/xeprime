import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type ApprovalTask = Schemas['ApprovalTaskListItemDto'];
export type ApprovalDetail = Schemas['ApprovalTaskDetailDto'];
export type ApprovalLogEntry = Schemas['ApprovalLogEntryDto'];

/** Filter hàng đợi duyệt (URL searchParams). */
export interface ApprovalFilters {
  status?: string;
  targetType?: string;
  page?: number;
  limit?: number;
}
