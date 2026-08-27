import type { components } from '@xeprime/types';

/** Type nhân sự nền tảng lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type Staff = Schemas['StaffDto'];
export type AddStaffInput = Schemas['AddStaffDto'];
export type UpdateStaffRoleInput = Schemas['UpdateStaffRoleDto'];

/** Filter danh sách nhân sự (state cục bộ như trang Người dùng của tenant). */
export interface StaffFilters {
  q?: string;
  roleKey?: string;
  page?: number;
  limit?: number;
}
