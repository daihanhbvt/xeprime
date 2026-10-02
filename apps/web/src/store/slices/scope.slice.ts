import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { SCOPE, type Scope, type Ulid } from '@xeprime/types';

/**
 * Scope đang xem của người dùng (gian hàng / nền tảng).
 *
 * CLAUDE.md mục 5 + lằn ranh bảo mật 1: giá trị ở đây CHỈ để hiển thị. API tenant-sensitive
 * không nhận `tenant_id` từ client — backend tự lấy từ membership. Đổi số ở đây không mở
 * được dữ liệu của shop khác.
 *
 * **Không có `branchId` ở đây** (ADR 0052). Chi nhánh từng nằm trong slice này và đó là chỗ sai:
 * nó là một BỘ LỌC danh sách, nên theo ADR 0004 nó thuộc về URL — Redux làm nó chết sau mỗi lần
 * F5 và không gửi link được. Nay mỗi màn lọc được có ô "Chi nhánh" riêng, đọc từ searchParams.
 */
export interface ScopeState {
  scope: Scope;
  tenantId: Ulid | null;
}

const initialState: ScopeState = {
  scope: SCOPE.TENANT,
  tenantId: null,
};

const scopeSlice = createSlice({
  name: 'scope',
  initialState,
  reducers: {
    setTenantScope(state, action: PayloadAction<{ tenantId: Ulid | null }>) {
      state.scope = SCOPE.TENANT;
      state.tenantId = action.payload.tenantId;
    },
    setPlatformScope(state) {
      state.scope = SCOPE.PLATFORM;
      state.tenantId = null;
    },
    resetScope() {
      return initialState;
    },
  },
});

export const { setTenantScope, setPlatformScope, resetScope } = scopeSlice.actions;

export const scopeReducer = scopeSlice.reducer;
