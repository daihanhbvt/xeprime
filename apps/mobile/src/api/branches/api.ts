import type { components } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type Branch = Schemas['BranchDto'];
export type BranchList = Schemas['BranchListDto'];
export type CreateBranchInput = Schemas['CreateBranchDto'];
export type UpdateBranchInput = Schemas['UpdateBranchDto'];

/**
 * Bộ lọc của màn Chi nhánh — trạng thái của MÀN HÌNH, không có trong contract.
 *
 * Web đặt nó ở state cục bộ, app native cũng vậy; cả hai serialize qua ĐÚNG hàm dưới đây, nếu
 * không query key của hai client lệch nhau ngay ở tham số đầu tiên.
 */
export interface BranchFilters {
  q?: string;
  status?: string;
}

export function branchFiltersToParams(filters: BranchFilters = {}): QueryParams {
  return { q: filters.q ?? null, status: filters.status ?? null };
}

/**
 * Ba thao tác VÒNG ĐỜI dùng chung một đường: chúng chỉ khác nhau ở đoạn cuối đường dẫn.
 *
 * Không có `delete`: chi nhánh còn xe/đơn là dữ liệu lịch sử của những chuyến đã đi, và FK ở DB
 * chặn xoá cứng. Vòng đời đúng là `deactivate`.
 */
export const BRANCH_ACTION = {
  SET_DEFAULT: 'set-default',
  ACTIVATE: 'activate',
  DEACTIVATE: 'deactivate',
} as const;

export type BranchAction = (typeof BRANCH_ACTION)[keyof typeof BRANCH_ACTION];

const base = '/branches';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

/**
 * Chi nhánh của gian hàng hiện tại (SHP-03).
 *
 * `tenantId` KHÔNG đi trên query — backend lấy từ phiên (CLAUDE.md mục 5): id chi nhánh của gian
 * hàng khác trả 404, không phải 403.
 *
 * Client KHÔNG tự đoán thao tác nào được phép: "còn xe nên không ngừng được", "phải có một chi
 * nhánh mặc định" là luật của backend và nó trả 409 kèm MÃ lỗi. Ẩn nút chỉ là trang trí.
 */
export const branchesApi = {
  list(filters: BranchFilters = {}): Promise<BranchList> {
    return getApiClient().get<BranchList>(base, branchFiltersToParams(filters));
  },

  detail(id: string): Promise<Branch> {
    return getApiClient().get<Branch>(one(id));
  },

  create(body: CreateBranchInput): Promise<Branch> {
    return getApiClient().post<Branch>(base, body);
  },

  update(id: string, body: UpdateBranchInput): Promise<Branch> {
    return getApiClient().patch<Branch>(one(id), body);
  },

  action(id: string, action: BranchAction): Promise<Branch> {
    return getApiClient().post<Branch>(`${one(id)}/${action}`, {});
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
