'use client';

import { useEffect, useMemo } from 'react';
import { BRANCH_STATUS, PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setBranch } from '@/store/slices/scope.slice';
import { useBranches } from './use-branches';
import type { Branch } from '../types';

export interface BranchScope {
  /** `null` = "Tất cả chi nhánh". */
  branchId: string | null;
  /** Chi nhánh đang chọn (đã xác thực thuộc gian hàng hiện tại). */
  branch: Branch | null;
  /** Chi nhánh chọn được ở bộ chọn — chỉ chi nhánh đang hoạt động. */
  options: Branch[];
  /** Có nên hiện bộ chọn không: cần quyền xem VÀ gian hàng có từ 2 chi nhánh trở lên. */
  canSelect: boolean;
  isLoading: boolean;
  select: (branchId: string | null) => void;
}

/**
 * Scope chi nhánh đang xem ở cổng quản lý.
 *
 * Redux giữ LỰA CHỌN, không giữ quyền: `branchId` chỉ THU HẸP dữ liệu trong gian hàng hiện tại,
 * và mọi endpoint vẫn lấy `tenantId` từ membership của phiên. Sửa giá trị này trong devtools
 * không mở được dữ liệu của gian hàng khác (CLAUDE.md mục 5, lằn ranh 1).
 *
 * Hook cũng tự DỌN lựa chọn cũ: chi nhánh vừa bị ngừng/xoá mà còn nằm trong scope sẽ khiến mọi
 * danh sách rỗng một cách khó hiểu — nên khi nó biến khỏi danh sách hợp lệ thì quay về "Tất cả".
 */
export function useBranchScope(): BranchScope {
  const dispatch = useAppDispatch();
  const branchId = useAppSelector((s) => s.scope.branchId);
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.BRANCH_VIEW);

  // Không có quyền thì KHÔNG gọi API — tránh 403 lặp lại ở mọi trang.
  const query = useBranches(canView ? { status: BRANCH_STATUS.ACTIVE } : {});
  const enabled = canView && !query.isError;
  const options = useMemo(() => (enabled ? (query.data?.items ?? []) : []), [enabled, query.data]);

  const branch = useMemo(
    () => options.find((b) => b.id === branchId) ?? null,
    [options, branchId],
  );

  useEffect(() => {
    if (!branchId) return;
    // Chỉ dọn khi đã có dữ liệu: lúc đang tải thì `options` rỗng, xoá ngay sẽ mất lựa chọn của
    // người dùng mỗi lần điều hướng.
    if (query.isLoading || !query.data) return;
    if (!options.some((b) => b.id === branchId)) dispatch(setBranch(null));
  }, [branchId, dispatch, options, query.data, query.isLoading]);

  return {
    branchId: branch ? branchId : null,
    branch,
    options,
    canSelect: canView && options.length > 1,
    isLoading: query.isLoading,
    select: (next: string | null) => dispatch(setBranch(next)),
  };
}

/**
 * Tham số `branchId` để ghép vào query của các màn CÓ NGHĨA theo chi nhánh (danh sách xe, đơn,
 * yêu cầu thuê, lịch). Trả về object rỗng khi đang chọn "Tất cả" — nhờ vậy query key không đổi
 * và không tạo thêm một lần fetch vô ích.
 */
export function useBranchScopeParams(): { branchId?: string } {
  const { branchId } = useBranchScope();
  return branchId ? { branchId } : {};
}
