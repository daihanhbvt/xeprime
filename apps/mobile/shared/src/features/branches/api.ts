// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { branchesApi, branchFiltersToParams, branchLabel, BRANCH_ACTION } from '@/api/branches/api';

export type {
  Branch,
  BranchAction,
  BranchFilters,
  BranchList,
  CreateBranchInput,
  UpdateBranchInput,
} from '@/api/branches/api';
