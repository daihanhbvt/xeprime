import { useCallback, useEffect, useMemo } from 'react';
import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { branchSelected } from '../branch-scope.slice';
import type { Branch } from '../api';
import { useActiveBranches } from './use-branches';

export interface BranchScope {
  /** `null` = "Tất cả chi nhánh". */
  branchId: string | null;
  /** Chi nhánh đang chọn, đã xác thực là còn nằm trong danh sách hợp lệ. */
  branch: Branch | null;
  /** Chọn được ở bộ chọn — chỉ chi nhánh ĐANG HOẠT ĐỘNG. */
  options: readonly Branch[];
  /** Có nên hiện dropdown không: cần quyền xem VÀ gian hàng có từ 2 chi nhánh trở lên. */
  canSelect: boolean;
  isLoading: boolean;
  select: (branchId: string | null) => void;
}

/**
 * Scope chi nhánh của cổng quản lý — bản native của `useBranchScope` bên web.
 *
 * Redux giữ LỰA CHỌN, không giữ quyền: `branchId` chỉ THU HẸP dữ liệu trong gian hàng hiện tại,
 * và mọi endpoint vẫn lấy `tenantId` từ membership của phiên.
 *
 * Hook cũng tự DỌN lựa chọn cũ: chi nhánh vừa bị ngừng/xoá mà còn nằm trong scope sẽ khiến mọi
 * danh sách rỗng một cách khó hiểu, nên khi nó biến khỏi danh sách hợp lệ thì quay về "Tất cả".
 * Chỉ dọn KHI ĐÃ CÓ dữ liệu — lúc đang tải thì `options` rỗng, xoá ngay là mất lựa chọn của
 * người dùng ở mỗi lần điều hướng.
 */
export function useBranchScope(): BranchScope {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.branchScope.branchId);
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.BRANCH_VIEW);

  // Không có quyền thì KHÔNG gọi API — tránh một chuỗi 403 ở mọi màn quản lý.
  const query = useActiveBranches(canView);
  /*
   * `isError` KHÔNG đồng nghĩa "không có dữ liệu": một refetch nền lỗi vẫn giữ `data` của lần
   * đọc thành công gần nhất (TanStack v5 — `isError` và `data` có thể cùng lúc là `true`/xác
   * định). Dựa vào `!query.isError` từng làm options rỗng đúng lúc mạng chập chờn, kéo theo
   * effect dọn bên dưới tưởng chi nhánh đã biến mất và xoá luôn lựa chọn của người dùng.
   */
  const options = useMemo<readonly Branch[]>(
    () => (canView ? (query.data?.items ?? []) : []),
    [canView, query.data],
  );

  const branch = useMemo(
    () => options.find((item) => item.id === selectedId) ?? null,
    [options, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    // Chỉ dọn khi đã ĐỌC THÀNH CÔNG danh sách — đang tải lần đầu hay một lần refetch lỗi thì
    // KHÔNG được coi là "chi nhánh đã biến mất" (xem docblock `options` ở trên).
    if (!query.isSuccess) return;
    if (!options.some((item) => item.id === selectedId)) dispatch(branchSelected(null));
  }, [selectedId, dispatch, options, query.isSuccess]);

  const select = useCallback((next: string | null) => dispatch(branchSelected(next)), [dispatch]);

  /*
   * Trước khi đọc THÀNH CÔNG (`query.isSuccess`), `options` rỗng vì dữ liệu chưa về — không được
   * coi đó là "chi nhánh không có trong danh sách" và trả `null` (ngầm mở rộng sang "Tất cả chi
   * nhánh", khiến các query đội xe/đơn thuê hiện dữ liệu NGOÀI phạm vi trong một nhịp render).
   * Giữ nguyên lựa chọn đã lưu cho tới khi xác thực được, đúng hướng với effect dọn ở trên.
   */
  const branchId = canView ? (query.isSuccess ? (branch ? selectedId : null) : selectedId) : null;

  return {
    branchId,
    branch,
    options,
    canSelect: canView && options.length > 1,
    isLoading: query.isLoading,
    select,
  };
}

/**
 * Tham số `branchId` để ghép vào query của các màn CÓ NGHĨA theo chi nhánh (đội xe, đơn thuê,
 * yêu cầu thuê). Trả object RỖNG khi đang chọn "Tất cả" — nhờ vậy query key không đổi và không
 * sinh thêm một lần fetch vô ích.
 *
 * Tham chiếu ổn định theo `branchId`: object mới mỗi render sẽ lọt vào `useMemo`/`queryKey` của
 * nơi gọi và làm chúng tính lại mỗi nhịp.
 */
export function useBranchScopeParams(): { branchId?: string } {
  const { branchId } = useBranchScope();
  return useMemo(() => (branchId ? { branchId } : {}), [branchId]);
}
