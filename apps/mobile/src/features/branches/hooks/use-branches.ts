import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BRANCH_STATUS } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import {
  branchFiltersToParams,
  branchesApi,
  type BranchAction,
  type BranchFilters,
  type CreateBranchInput,
  type UpdateBranchInput,
} from '../api';

/**
 * Chi nhánh của gian hàng hiện tại (SHP-03).
 *
 * `tenantId` KHÔNG đi trên query — backend lấy từ phiên.
 *
 * Key dựng từ CHÍNH bộ tham số gửi đi (`branchFiltersToParams`), không gõ tay: bộ chọn chi nhánh
 * ở thanh trên và màn Chi nhánh cùng hỏi `status=active`, và hai key lệch nhau một trường là hai
 * request cho cùng một câu hỏi — đúng thứ mà một lần `invalidateQueries` sau đó chỉ dọn được một
 * nửa.
 */
export function useBranches(filters: BranchFilters = {}, enabled = true) {
  const params = branchFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.branches.list(params),
    queryFn: () => branchesApi.list(filters),
    enabled,
  });
}

/**
 * Chi nhánh ĐANG HOẠT ĐỘNG — bộ chọn ở thanh trên và ô chọn chi nhánh của form xe dùng chung.
 *
 * Một hàm cho cả ba nơi để chúng không thể đặt key khác nhau; đó là lý do nó nằm ở đây chứ không
 * viết lại `useQuery` tại từng màn.
 */
export function useActiveBranches(enabled = true) {
  return useBranches({ status: BRANCH_STATUS.ACTIVE }, enabled);
}

/**
 * Bề mặt phải làm mới sau MỌI thay đổi chi nhánh.
 *
 * Ba nhánh, và bỏ sót nhánh nào cũng là màn hình nói một đằng dữ liệu một nẻo:
 * - `branches` — danh sách và bộ chọn ở thanh trên;
 * - `vehicles` — thẻ xe in TÊN chi nhánh, và đổi tỉnh của chi nhánh là dời vị trí công khai của
 *   mọi xe thuộc nó;
 * - `shop` — hồ sơ gian hàng mang TỈNH của chi nhánh mặc định (`syncProfileFromDefaultBranch`),
 *   nên đặt-làm-mặc-định làm hồ sơ cũ theo.
 */
export function useInvalidateBranchSurfaces() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
  };
}

export function useCreateBranch() {
  const invalidate = useInvalidateBranchSurfaces();
  return useMutation({
    mutationFn: (body: CreateBranchInput) => branchesApi.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateBranch() {
  const invalidate = useInvalidateBranchSurfaces();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBranchInput }) =>
      branchesApi.update(id, body),
    onSuccess: invalidate,
  });
}

/**
 * Ba thao tác vòng đời dùng CHUNG một mutation — chúng chỉ khác nhau ở đoạn đường và câu thông
 * báo. Tách thành ba hook gần giống hệt nhau chỉ tạo chỗ để chúng lệch nhau về sau.
 */
export function useBranchAction() {
  const invalidate = useInvalidateBranchSurfaces();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: BranchAction }) =>
      branchesApi.action(id, action),
    onSuccess: invalidate,
  });
}
