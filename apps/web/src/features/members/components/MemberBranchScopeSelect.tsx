'use client';

import { useTranslations } from 'next-intl';
import { MEMBERSHIP_BRANCH_SCOPE } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { branchLabel } from '@/features/branches/branch-label';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { MemberRosterItem, UpdateMemberRoleInput } from '../types';

/**
 * Ô chi nhánh phụ trách LUÔN có giá trị — không có trạng thái "bỏ trống".
 *
 * Bản đầu dùng quy ước "rỗng = tất cả" (placeholder mờ), người dùng chê đúng: một ô xám nhạt
 * trông như chưa cấu hình, và nó mâu thuẫn với option "Tất cả chi nhánh" vừa thêm. Chốt lại:
 * "Tất cả chi nhánh" (`ALL_FILTER`) là một GIÁ TRỊ thật, mặc định được chọn sẵn; chọn chi nhánh
 * cụ thể thì nó tự rời đi, gỡ chi nhánh cuối cùng thì nó tự quay lại — ô không bao giờ rỗng.
 * `ALL_FILTER` = 'all' không đụng được id thật (ULID 26 ký tự).
 */

/** Giá trị hiển thị từ dữ liệu server: limited = danh sách id, còn lại = ["all"]. */
export function toBranchSelection(branchIds: readonly string[] | undefined): string[] {
  // Phòng thủ undefined: cache cũ (trước khi contract có branchIds) vẫn có thể còn trên client.
  return branchIds && branchIds.length > 0 ? [...branchIds] : [ALL_FILTER];
}

/**
 * Chuẩn hoá một lượt đổi của Select. AntD nối lựa chọn MỚI vào cuối mảng, nên phần tử cuối là
 * thứ người dùng vừa bấm: vừa bấm "Tất cả" ⇒ chỉ còn "Tất cả"; vừa bấm một chi nhánh ⇒ "Tất cả"
 * rời đi; gỡ tới rỗng ⇒ quay về "Tất cả".
 */
export function normalizeBranchSelection(next: readonly string[], allowAll = true): string[] {
  // Người bị giới hạn không có "Tất cả" để quay về: rỗng là rỗng, và form/ô sẽ chặn nó lại.
  if (!allowAll) return next.filter((v) => v !== ALL_FILTER);
  if (next.length === 0 || next[next.length - 1] === ALL_FILTER) return [ALL_FILTER];
  return next.filter((v) => v !== ALL_FILTER);
}

/**
 * Người đang thao tác có SỬA được phạm vi/vai của thành viên này không (ADR 0052).
 *
 * Gương của `assertWithinActorScope` ở backend: người bị giới hạn chỉ chạm được thành viên có
 * phạm vi NẰM GỌN trong phần của mình. Backend vẫn là lớp chặn thật (`BRANCH_SCOPE_EXCEEDED`);
 * ở đây chỉ để ô bị khoá sẵn thay vì cho người dùng chọn rồi mới báo lỗi.
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
  const ids = (selection ?? []).filter((v) => v !== ALL_FILTER);
  return ids.length > 0
    ? { branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: ids }
    : { branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL };
}

/**
 * Options dùng chung cho bảng nhân sự và modal mời — "Tất cả chi nhánh" luôn đứng đầu.
 *
 * Người thao tác bị GIỚI HẠN (ADR 0052) không cấp được "Tất cả": mục đó vẫn nằm trong danh sách
 * để một thành viên đang `all` hiện đúng nhãn, nhưng bị KHOÁ — và `defaultSelection` của họ là
 * toàn bộ chi nhánh mình phụ trách (phạm vi rộng nhất họ được phép giao), không phải "Tất cả".
 */
export function useBranchScopeOptions() {
  const t = useTranslations('Members');
  const tBranches = useTranslations('Branches');
  const branches = useBranches();
  const { data: user } = useCurrentUser();
  const allowAll = user?.tenant?.branchScope !== MEMBERSHIP_BRANCH_SCOPE.LIMITED;
  const items = branches.data?.items ?? [];
  const branchIds = items.map((b) => b.id);
  const branchOptions = items.map((b) => ({
    value: b.id,
    label: branchLabel(b, tBranches('labels.noProvince')),
  }));
  return {
    isLoading: branches.isLoading,
    count: items.length,
    allowAll,
    branchIds,
    defaultSelection: allowAll ? [ALL_FILTER] : branchIds,
    options: [
      { value: ALL_FILTER, label: t('branchScope.all'), disabled: !allowAll },
      ...branchOptions,
    ],
    /** Tên chi nhánh theo id — cột "Chi nhánh phụ trách" của danh sách và ngăn chi tiết. */
    labelById: new Map(branchOptions.map((o) => [o.value, o.label])),
  };
}

/**
 * Tên các chi nhánh của một thành viên, theo thứ tự danh sách chi nhánh. Phạm vi `all` ⇒ `null`
 * (nơi gọi hiện "Tất cả chi nhánh"). Id không còn trong danh sách (chi nhánh đã ngừng, hoặc ngoài
 * phần người xem phụ trách) đi ra `unknownLabel` thay vì biến mất — "phụ trách 2 chi nhánh" mà chỉ
 * hiện 1 là nói sai về quyền của người đó.
 */
export function memberBranchNames(
  member: Pick<MemberRosterItem, 'branchScope' | 'branchIds'>,
  labelById: ReadonlyMap<string, string>,
  unknownLabel: string,
): string[] | null {
  if (member.branchScope !== MEMBERSHIP_BRANCH_SCOPE.LIMITED) return null;
  return member.branchIds.map((id) => labelById.get(id) ?? unknownLabel);
}

