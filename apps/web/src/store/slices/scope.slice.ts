import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { SCOPE, type Scope, type Ulid } from '@xeprime/types';

/**
 * Scope đang xem của người dùng (gian hàng / chi nhánh / nền tảng).
 *
 * CLAUDE.md mục 5 + lằn ranh bảo mật 1: giá trị ở đây CHỈ để hiển thị. API tenant-sensitive
 * không nhận `tenant_id` từ client — backend tự lấy từ membership. Đổi số ở đây không mở
 * được dữ liệu của shop khác.
 */
export interface ScopeState {
  scope: Scope;
  tenantId: Ulid | null;
  branchId: Ulid | null;
}

const initialState: ScopeState = {
  scope: SCOPE.TENANT,
  tenantId: null,
  branchId: null,
};

const scopeSlice = createSlice({
  name: 'scope',
  initialState,
  reducers: {
    setTenantScope(state, action: PayloadAction<{ tenantId: Ulid | null }>) {
      state.scope = SCOPE.TENANT;
      state.tenantId = action.payload.tenantId;
      state.branchId = null;
    },
    setPlatformScope(state) {
      state.scope = SCOPE.PLATFORM;
      state.tenantId = null;
      state.branchId = null;
    },
    setBranch(state, action: PayloadAction<Ulid | null>) {
      state.branchId = action.payload;
    },
    resetScope() {
      return initialState;
    },
  },
});

export const { setTenantScope, setPlatformScope, setBranch, resetScope } = scopeSlice.actions;

export const scopeReducer = scopeSlice.reducer;
