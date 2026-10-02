import { describe, expect, it } from 'vitest';
import { MEMBERSHIP_BRANCH_SCOPE } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import {
  canManageMemberScope,
  normalizeBranchSelection,
  toBranchScopeInput,
} from './MemberBranchScopeSelect';

/**
 * Gương phía web của `assertWithinActorScope` (ADR 0052). Backend vẫn là lớp chặn thật — các ca ở
 * đây chỉ bảo đảm giao diện không mời người bị giới hạn chọn một thứ chắc chắn bị từ chối.
 */
describe('normalizeBranchSelection', () => {
  it('toàn gian hàng: gỡ hết thì quay về "Tất cả", bấm "Tất cả" thì chỉ còn nó', () => {
    expect(normalizeBranchSelection([])).toEqual([ALL_FILTER]);
    expect(normalizeBranchSelection(['A', ALL_FILTER])).toEqual([ALL_FILTER]);
    expect(normalizeBranchSelection([ALL_FILTER, 'A'])).toEqual(['A']);
  });

  it('người bị giới hạn: KHÔNG có "Tất cả" để rơi về — rỗng là rỗng', () => {
    expect(normalizeBranchSelection([], false)).toEqual([]);
    expect(normalizeBranchSelection(['A', ALL_FILTER], false)).toEqual(['A']);
  });

  it('rỗng không bao giờ được gửi đi như một phạm vi hẹp', () => {
    expect(toBranchScopeInput([])).toEqual({ branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL });
  });
});

describe('canManageMemberScope', () => {
  const limited = (...ids: string[]) => ({ branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: ids });
  const all = { branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL, branchIds: [] };

  it('người thao tác toàn gian hàng sửa được mọi thành viên', () => {
    expect(canManageMemberScope(true, [], all)).toBe(true);
  });

  it('người bị giới hạn không sửa được thành viên "Tất cả" hay phụ trách chi nhánh ngoài phần mình', () => {
    expect(canManageMemberScope(false, ['A'], all)).toBe(false);
    expect(canManageMemberScope(false, ['A'], limited('A', 'B'))).toBe(false);
  });

  it('người bị giới hạn sửa được thành viên nằm gọn trong phần của mình', () => {
    expect(canManageMemberScope(false, ['A', 'B'], limited('B'))).toBe(true);
  });
});
