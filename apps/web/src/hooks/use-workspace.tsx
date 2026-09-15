'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { WORKSPACE, workspacePaths, type Workspace, type WorkspacePaths } from '@/constants/routes';
import { canUseManagePortal } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';

export interface WorkspaceContextValue {
  workspace: Workspace;
  paths: WorkspacePaths;
  /** Người này làm việc ở cổng quản lý — gian hàng có gói, hoặc nhân viên của một gian hàng. */
  isManage: boolean;
}

/**
 * Mặc định là CỔNG QUẢN LÝ, và đó là một lựa chọn có chủ đích, không phải giá trị tạm.
 *
 * `/manage` là hành vi cũ của mọi link trước bản 14/09/2026, nên component nào render ngoài
 * provider (test đơn vị, storybook, một nhánh render sớm) vẫn cho ra đúng thứ nó vốn cho ra.
 * Đoán lệch theo chiều ngược lại nguy hiểm hơn nhiều: nó sẽ đẩy một gian hàng có gói sang
 * `/account`, nơi họ thiếu quá nửa bộ công cụ.
 */
const DEFAULT_VALUE: WorkspaceContextValue = {
  workspace: WORKSPACE.MANAGE,
  paths: workspacePaths(WORKSPACE.MANAGE),
  isManage: true,
};

const WorkspaceContext = createContext<WorkspaceContextValue>(DEFAULT_VALUE);

/**
 * Khu làm việc là NGỮ CẢNH, không phải dữ liệu của từng component.
 *
 * Vì sao không để mỗi component tự gọi `useCurrentUser`: nó biến những component thuần trình bày
 * (form hồ sơ gian hàng, một bước của wizard, dải trạng thái) thành thứ đòi phải có
 * `QueryClientProvider` mới render nổi — đúng cái giá đã trả một lần trong bản nháp của thay đổi
 * này, khi 71 test của các màn không liên quan đỏ lên vì một link đổi đích.
 *
 * Provider đặt ở `Providers` gốc, tức là NGOÀI cả hai vỏ (`AppShell` của khu quản lý và
 * `AccountShell` của khu tài khoản) — `AppShell` vừa đọc context này vừa là cổng chặn của nó,
 * nên nó không thể tự cấp.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();

  const value = useMemo<WorkspaceContextValue>(() => {
    /*
     * Chưa biết mình là ai, hoặc chưa có gian hàng nào → giữ mặc định `/manage`: đó là nơi
     * `/manage/onboarding` sống. Chỉ khi đã xác định được đây là chủ xe TUYẾN HOA HỒNG thì link
     * mới đổi khu.
     */
    if (!user || user.tenant == null || canUseManagePortal(user)) return DEFAULT_VALUE;
    return {
      workspace: WORKSPACE.ACCOUNT,
      paths: workspacePaths(WORKSPACE.ACCOUNT),
      isManage: false,
    };
  }, [user]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * "Link này phải trỏ về khu nào" — dùng ở mọi component có nút dẫn về chỗ làm việc.
 *
 * Chỉ đọc context, không gọi query: component dùng nó vẫn render được ở bất kỳ đâu.
 */
export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
