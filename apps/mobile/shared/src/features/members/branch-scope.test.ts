import { MEMBERSHIP_BRANCH_SCOPE } from '@xeprime/types';
import {
  BRANCH_SCOPE_ALL,
  canManageMemberScope,
  normalizeBranchSelection,
  toBranchScopeInput,
  toBranchSelection,
  toggleBranchSelection,
} from './branch-scope';

const A = '01JQZX00000000000000000BRA';
const B = '01JQZX00000000000000000BRB';

describe('branch-scope (ADR 0052 — gương web MemberBranchScopeSelect)', () => {
  it('toBranchScopeInput: "Tất cả" ⇒ all, danh sách ⇒ limited', () => {
    expect(toBranchScopeInput([BRANCH_SCOPE_ALL])).toEqual({
      branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL,
    });
    expect(toBranchScopeInput(undefined)).toEqual({ branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL });
    expect(toBranchScopeInput([A, B])).toEqual({
      branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED,
      branchIds: [A, B],
    });
  });

  it('toBranchSelection: rỗng ⇒ ["all"]', () => {
    expect(toBranchSelection([])).toEqual([BRANCH_SCOPE_ALL]);
    expect(toBranchSelection([A])).toEqual([A]);
  });

  it('normalize/toggle giữ bất biến "không bao giờ rỗng" khi được phép "Tất cả"', () => {
    expect(normalizeBranchSelection([BRANCH_SCOPE_ALL, A])).toEqual([A]);
    expect(normalizeBranchSelection([A, BRANCH_SCOPE_ALL])).toEqual([BRANCH_SCOPE_ALL]);
    expect(normalizeBranchSelection([])).toEqual([BRANCH_SCOPE_ALL]);
    expect(toggleBranchSelection([BRANCH_SCOPE_ALL], A)).toEqual([A]);
    expect(toggleBranchSelection([A], A)).toEqual([BRANCH_SCOPE_ALL]);
    // Người bị giới hạn: rỗng là rỗng (form chặn lại).
    expect(toggleBranchSelection([A], A, false)).toEqual([]);
  });

  it('canManageMemberScope: chỉ thành viên nằm GỌN trong phạm vi người thao tác', () => {
    const all = { branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL, branchIds: [] };
    const inA = { branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: [A] };
    const inAB = { branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: [A, B] };
    expect(canManageMemberScope(true, [], all)).toBe(true);
    expect(canManageMemberScope(false, [A], all)).toBe(false);
    expect(canManageMemberScope(false, [A], inA)).toBe(true);
    expect(canManageMemberScope(false, [A], inAB)).toBe(false);
  });
});
