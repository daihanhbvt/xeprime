import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Chi nhánh đang xem ở khu quản lý — gương của `scope.slice.ts` bên web (phần `branchId`).
 *
 * Ở Redux vì đây đúng là UI state theo ADR 0004: người dùng CHỌN nó, và lựa chọn phải sống qua
 * mọi màn của cổng quản lý (thanh trên và danh sách nằm ở hai cây component khác nhau).
 *
 * Giá trị này CHỈ THU HẸP dữ liệu trong gian hàng hiện tại. Nó không phải một cửa quyền: mọi
 * endpoint vẫn lấy `tenantId` từ membership của phiên, nên sửa số ở đây không mở được dữ liệu
 * của gian hàng khác (CLAUDE.md mục 6, lằn ranh 1).
 *
 * Cái KHÔNG nằm ở đây: danh sách chi nhánh và quyền `branches.view` — chúng là dữ liệu server,
 * đọc qua TanStack Query. Chép vào store là dựng nguồn sự thật thứ hai, và nó ôi đúng vào lúc
 * một chi nhánh bị ngừng hoạt động.
 */
interface BranchScopeState {
  /** `null` = "Tất cả chi nhánh". */
  branchId: string | null;
}

const initialState: BranchScopeState = { branchId: null };

const branchScopeSlice = createSlice({
  name: 'branchScope',
  initialState,
  reducers: {
    branchSelected(state, action: PayloadAction<string | null>) {
      state.branchId = action.payload;
    },
    /**
     * Kết thúc phiên: quên chi nhánh đang chọn.
     *
     * Thiếu bước này thì người kế tiếp đăng nhập trên cùng máy mang theo id chi nhánh của gian
     * hàng trước. Nó không rò dữ liệu (backend vẫn lọc theo tenant của phiên mới), nhưng mọi
     * danh sách trả về rỗng cho tới khi `useBranchScope` kịp dọn — một màn trống không giải
     * thích được.
     */
    branchScopeReset() {
      return initialState;
    },
  },
});

export const { branchSelected, branchScopeReset } = branchScopeSlice.actions;

export const branchScopeReducer = branchScopeSlice.reducer;
