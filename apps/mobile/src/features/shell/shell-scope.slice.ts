import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { APP_SCOPE, type AppScope } from './app-scope';

/**
 * State của VỎ app: đang ở khu nào, và mỗi khu đang dở màn nào.
 *
 * Ở Redux vì đây đúng là UI/client state theo ADR 0004 — người dùng CHỌN nó. Cái KHÔNG ở đây:
 * `tenant`, `permissions`, token. Chúng là dữ liệu server (`/auth/me` qua TanStack Query) hoặc
 * bí mật (Keychain); chép vào store là dựng một nguồn sự thật thứ hai, và nó ôi thiu đúng lúc
 * quyền bị thu hồi.
 */
interface ShellScopeState {
  scope: AppScope;
  /**
   * Màn cuối cùng của mỗi khu, để đổi khu quay lại đúng chỗ đang dở.
   *
   * Chỉ NHỚ ĐÍCH, không giữ cả back stack (doc 15 §2.4 phương án A): expo-router không có API
   * chính thức để giữ hai cây cùng sống, và người dùng mong thấy lại "tôi đang xem đơn #123"
   * chứ không mong nguyên chồng 5 màn phía sau.
   */
  lastRoute: Partial<Record<AppScope, string>>;
  /**
   * Deep link nhận được khi CHƯA đăng nhập — tiêu thụ sau khi vào app thay vì rơi về trang chủ.
   * Là một URL, không phải "màn nào": payload thông báo chỉ mang URL, và giữ nguyên như vậy thì
   * thêm màn mới không phải sửa cả backend lẫn app.
   */
  pendingDeepLink: string | null;
}

const initialState: ShellScopeState = {
  scope: APP_SCOPE.CUSTOMER,
  lastRoute: {},
  pendingDeepLink: null,
};

const shellScopeSlice = createSlice({
  name: 'shellScope',
  initialState,
  reducers: {
    scopeChanged(state, action: PayloadAction<AppScope>) {
      state.scope = action.payload;
    },
    lastRouteChanged(state, action: PayloadAction<{ scope: AppScope; route: string }>) {
      state.lastRoute[action.payload.scope] = action.payload.route;
    },
    deepLinkPended(state, action: PayloadAction<string>) {
      state.pendingDeepLink = action.payload;
    },
    deepLinkConsumed(state) {
      state.pendingDeepLink = null;
    },
    /**
     * Kết thúc phiên: về khu khách và quên mọi đích đã nhớ.
     *
     * Thiếu bước này thì người kế tiếp đăng nhập trên cùng máy mở thẳng vào khu quản lý của một
     * gian hàng họ không thuộc về, rồi bị `ScopeGuard` đá ra — một cú nháy không giải thích được.
     */
    shellScopeReset() {
      return initialState;
    },
  },
});

export const { scopeChanged, lastRouteChanged, deepLinkPended, deepLinkConsumed, shellScopeReset } =
  shellScopeSlice.actions;

export const shellScopeReducer = shellScopeSlice.reducer;
