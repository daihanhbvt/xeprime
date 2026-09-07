import type { components } from '@xeprime/types';
import { getApiClient } from '../../client';

type Schemas = components['schemas'];

export type Branch = Schemas['BranchDto'];
export type BranchList = Schemas['BranchListDto'];

/**
 * Chi nhánh của gian hàng hiện tại.
 *
 * `tenantId` KHÔNG đi trên query — backend lấy từ phiên (CLAUDE.md mục 5).
 *
 * Chỉ có phần ĐỌC: chi nhánh là VỊ TRÍ CÔNG KHAI của xe, nên form xe cần danh sách để chọn; còn
 * tạo/sửa/ngừng chi nhánh là một màn quản trị riêng, chưa có bản native.
 */
export const branchesApi = {
  list(status?: string): Promise<BranchList> {
    return getApiClient().get<BranchList>('/branches', { status: status ?? null });
  },
};


export function branchLabel(
  branch: Pick<Branch, 'name' | 'provinceName'>,
  noProvinceLabel: string,
): string {
  return branch.provinceName
    ? `${branch.name} · ${branch.provinceName}`
    : `${branch.name} · ${noProvinceLabel}`;
}
