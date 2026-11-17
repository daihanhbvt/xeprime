import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { MEMBERSHIP_BRANCH_SCOPE } from '@xeprime/types';
import { branchLabel } from '@/api/branches/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useBranches } from '@/features/branches/hooks/use-branches';
import type { MemberRosterItem, UpdateMemberRoleInput } from './api';

/**
 * Chi nhánh phụ trách của thành viên — bản native của
 * `apps/web/src/features/members/components/MemberBranchScopeSelect.tsx` (ADR 0052).
 *
 * Ô LUÔN có giá trị: "Tất cả chi nhánh" (`BRANCH_SCOPE_ALL`) là một GIÁ TRỊ thật, mặc định được
 * chọn; chọn chi nhánh cụ thể thì nó rời đi, gỡ chi nhánh cuối thì nó quay lại. Sentinel 'all'
 * không đụng được id thật (ULID 26 ký tự) và không bao giờ xuống API.
 */
export const BRANCH_SCOPE_ALL = 'all';

/** Giá trị hiển thị từ dữ liệu server: limited = danh sách id, còn lại = ["all"]. */
export function toBranchSelection(branchIds: readonly string[] | undefined): string[] {
  return branchIds && branchIds.length > 0 ? [...branchIds] : [BRANCH_SCOPE_ALL];
}

/**
 * Chuẩn hoá một lượt đổi; phần tử CUỐI là thứ vừa bấm (giống AntD bên web). Người bị giới hạn
 * không có "Tất cả" để quay về: rỗng là rỗng, form sẽ chặn.
 */
export function normalizeBranchSelection(next: readonly string[], allowAll = true): string[] {
  if (!allowAll) return next.filter((v) => v !== BRANCH_SCOPE_ALL);
  if (next.length === 0 || next[next.length - 1] === BRANCH_SCOPE_ALL) return [BRANCH_SCOPE_ALL];
  return next.filter((v) => v !== BRANCH_SCOPE_ALL);
}

/** Bật/tắt MỘT mục rồi chuẩn hoá — cử chỉ chạm của danh sách tick trên native. */
export function toggleBranchSelection(
  current: readonly string[],
  value: string,
  allowAll = true,
): string[] {
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return normalizeBranchSelection(next, allowAll);
}

/**
 * Người thao tác có chạm được thành viên này không — gương của `assertWithinActorScope` ở backend
 * (lớp chặn thật vẫn là `BRANCH_SCOPE_EXCEEDED`).
 *
 * @param actorBranchIds Chi nhánh người thao tác thấy — `GET /branches` đã thu hẹp sẵn theo phạm vi.
 */
export function canManageMemberScope(
  allowAll: boolean,
  actorBranchIds: readonly string[],
  member: Pick<MemberRosterItem, 'branchScope' | 'branchIds'>,
): boolean {
  if (allowAll) return true;
  return (
    member.branchScope === MEMBERSHIP_BRANCH_SCOPE.LIMITED &&
    member.branchIds.length > 0 &&
    member.branchIds.every((id) => actorBranchIds.includes(id))
  );
}

/** Đổi giá trị của ô (đã chuẩn hoá) thành cặp `branchScope`/`branchIds` API cần. */
export function toBranchScopeInput(
  selection: readonly string[] | undefined,
): Pick<UpdateMemberRoleInput, 'branchScope' | 'branchIds'> {
  const ids = (selection ?? []).filter((v) => v !== BRANCH_SCOPE_ALL);
  return ids.length > 0
    ? { branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: ids }
    : { branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL };
}

export interface BranchScopeOption {
  value: string;
  label: string;
  disabled: boolean;
}

/**
 * Options dùng chung cho thẻ thành viên và tấm mời — "Tất cả chi nhánh" luôn đứng đầu.
 * Người bị GIỚI HẠN không cấp được "Tất cả": mục đó bị khoá, và mặc định của họ là toàn bộ chi
 * nhánh mình phụ trách.
 */
export function useBranchScopeOptions() {
  const t = useTranslations('Members');
  const tBranches = useTranslations('Branches');
  const branches = useBranches();
  const { data: user } = useCurrentUser();
  const allowAll = user?.tenant?.branchScope !== MEMBERSHIP_BRANCH_SCOPE.LIMITED;
  const items = useMemo(() => branches.data?.items ?? [], [branches.data]);
  // Ổn định tham chiếu: danh sách thành viên đưa nó vào `renderItem` của FlatList.
  const branchIds = useMemo(() => items.map((b) => b.id), [items]);
  const noProvince = tBranches('labels.noProvince');
  const branchOptions = useMemo(
    () =>
      items.map((b) => ({
        value: b.id,
        label: branchLabel(b, noProvince),
        disabled: false,
      })),
    [items, noProvince],
  );
  const allLabel = t('branchScope.all');
  const options = useMemo<BranchScopeOption[]>(
    () => [{ value: BRANCH_SCOPE_ALL, label: allLabel, disabled: !allowAll }, ...branchOptions],
    [allLabel, allowAll, branchOptions],
  );
  // Ổn định tham chiếu như `branchIds`: `renderItem` của danh sách thành viên phụ thuộc nó.
  const labelById = useMemo(
    () => new Map(branchOptions.map((o) => [o.value, o.label])),
    [branchOptions],
  );
  const defaultSelection = useMemo(
    () => (allowAll ? [BRANCH_SCOPE_ALL] : branchIds),
    [allowAll, branchIds],
  );
  return {
    isLoading: branches.isLoading,
    count: items.length,
    allowAll,
    branchIds,
    defaultSelection,
    options,
    /** Tên chi nhánh theo id — dòng "Chi nhánh phụ trách" của thẻ và tấm chi tiết. */
    labelById,
  };
}

/**
 * Tên các chi nhánh của một thành viên — gương của `memberBranchNames` bên web. Phạm vi `all` ⇒
 * `null` (nơi gọi hiện "Tất cả chi nhánh"). Id không còn trong danh sách đi ra `unknownLabel` thay
 * vì biến mất — "phụ trách 2 chi nhánh" mà chỉ hiện 1 là nói sai về quyền của người đó.
 */
export function memberBranchNames(
  member: Pick<MemberRosterItem, 'branchScope' | 'branchIds'>,
  labelById: ReadonlyMap<string, string>,
  unknownLabel: string,
): string[] | null {
  if (member.branchScope !== MEMBERSHIP_BRANCH_SCOPE.LIMITED) return null;
  return member.branchIds.map((id) => labelById.get(id) ?? unknownLabel);
}
