'use client';

import { Select } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MEMBERSHIP_BRANCH_SCOPE } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { branchLabel } from '@/features/branches/branch-label';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { Member, UpdateMemberRoleInput } from '../types';

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
  member: Pick<Member, 'branchScope' | 'branchIds'>,
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
  return {
    isLoading: branches.isLoading,
    count: items.length,
    allowAll,
    branchIds,
    defaultSelection: allowAll ? [ALL_FILTER] : branchIds,
    options: [
      { value: ALL_FILTER, label: t('branchScope.all'), disabled: !allowAll },
      ...items.map((b) => ({
        value: b.id,
        label: branchLabel(b, tBranches('labels.noProvince')),
      })),
    ],
  };
}

/**
 * Ô chọn chi nhánh phụ trách của MỘT thành viên, nằm ngay trong bảng — ADR 0052.
 *
 * Commit khi ĐÓNG dropdown chứ không phải mỗi lần tick: một người phụ trách ba chi nhánh là ba
 * cú tick, và ba lượt PATCH giữa chừng sẽ có hai lượt mang trạng thái nửa vời (kèm hai toast).
 * Người dùng chọn xong, đóng dropdown, MỘT lượt ghi đi. Ngoại lệ là nút `×` trên tag: nó đổi giá
 * trị khi dropdown đang ĐÓNG, nên không có lượt đóng nào tới sau để ghi hộ — ca đó ghi ngay.
 */
export function MemberBranchScopeSelect({
  member,
  className,
  disabled,
  onCommit,
  loading,
}: {
  member: Member;
  className?: string;
  disabled?: boolean;
  /** Nhận giá trị ĐÃ chuẩn hoá (có thể là `["all"]`) — map sang API bằng `toBranchScopeInput`. */
  onCommit: (selection: string[]) => void;
  loading?: boolean;
}) {
  const t = useTranslations('Members');
  const { options, isLoading, allowAll, branchIds } = useBranchScopeOptions();
  // Thành viên rộng hơn phần của mình thì không phải của mình để sửa — khoá luôn ô (ADR 0052).
  const locked = !canManageMemberScope(allowAll, branchIds, member);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  const saved = toBranchSelection(member.branchIds);
  const value = draft ?? saved;

  /** So sánh theo TẬP: mở ra rồi đóng lại mà không đổi gì thì không có lượt ghi nào đi. */
  const commit = (next: string[]) => {
    setDraft(null);
    // Người bị giới hạn gỡ hết chi nhánh: không có "Tất cả" để rơi về, nên KHÔNG ghi gì — ô trở
    // lại giá trị đã lưu. Gửi đi một phạm vi rỗng là xin "toàn gian hàng", backend sẽ từ chối.
    if (next.length === 0) return;
    if ([...saved].sort().join(',') !== [...next].sort().join(',')) onCommit(next);
  };

  return (
    <Select
      mode="multiple"
      size="small"
      className={className}
      aria-label={t('branchScope.selectAria', { name: member.displayName })}
      /*
       * Số tag CỐ ĐỊNH, không `"responsive"`: trong ô bảng hẹp, phép đo của AntD trả về 0 tag vừa
       * chỗ và dồn tất cả vào "+N" — người quản lý nhìn "+ 2 ..." mà không biết là chi nhánh nào,
       * và không còn nút × nào để gỡ. Hai tag đầu luôn hiện tên, phần dư mới gom thành "+N".
       */
      maxTagCount={2}
      value={value}
      options={options}
      disabled={disabled || locked}
      loading={loading || isLoading}
      open={open}
      onChange={(next: string[]) => {
        const normalized = normalizeBranchSelection(next, allowAll);
        /*
         * Dropdown ĐÓNG mà giá trị vẫn đổi được: đó là nút `×` trên tag. Lúc đó sẽ không có lượt
         * `onOpenChange` nào tới sau để commit hộ, nên bản nháp sẽ nằm lại trên màn hình trông
         * như đã lưu — người quản lý tưởng vừa thu hẹp quyền của nhân viên mà thật ra không có
         * gì đổi. Đóng thì ghi ngay; mở thì vẫn gom cả loạt tick vào MỘT lượt ghi lúc đóng.
         */
        if (open) setDraft(normalized);
        else commit(normalized);
      }}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen || draft === null) return;
        commit(draft);
      }}
    />
  );
}
