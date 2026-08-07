import { describe, expect, it } from 'vitest';

import { makeStore } from '../make-store';
import {
  appReducer,
  setMobileNavOpen,
  setSidebarCollapsed,
  setThemeMode,
  toggleSidebar,
  THEME_MODE,
  type AppState,
} from './app.slice';

/**
 * State UI của vỏ portal.
 *
 * ⚠️ **Không có persistence.** `sidebarCollapsed` chỉ sống trong phiên. Repo chưa có hạ tầng
 * lưu trạng thái nào (không `redux-persist`, không đọc/ghi `localStorage` ở đâu), và chỉ thị
 * Batch 1D-B cấm dựng cơ chế lưu thứ hai chỉ để phục vụ một tuỳ chọn giao diện.
 *
 * Đổi lại có một thứ được miễn phí và đáng giá: state khởi tạo là hằng `false` ở CẢ server lẫn
 * client, nên lần render đầu giống hệt nhau — không có hydration mismatch, không có cú nhảy
 * bố cục khi trang vừa tải. Một bản `localStorage` sẽ phải đánh đổi đúng chỗ đó.
 *
 * Test dưới đây khoá cả hai mặt: mặc định đúng, và KHÔNG có ai đang lén ghi ra ngoài.
 */

const initial = (): AppState => appReducer(undefined, { type: '@@INIT' });

describe('app.slice — mặc định', () => {
  it('sidebar mở, drawer đóng, theme sáng', () => {
    expect(initial()).toEqual({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      themeMode: THEME_MODE.LIGHT,
    });
  });

  it('store dựng mới luôn ra cùng một state — nền tảng của việc không lệch hydration', () => {
    expect(makeStore().getState().app).toEqual(makeStore().getState().app);
    expect(makeStore().getState().app.sidebarCollapsed).toBe(false);
  });
});

describe('app.slice — thu gọn sidebar', () => {
  it('toggleSidebar lật qua lại', () => {
    let state = initial();

    state = appReducer(state, toggleSidebar());
    expect(state.sidebarCollapsed).toBe(true);

    state = appReducer(state, toggleSidebar());
    expect(state.sidebarCollapsed).toBe(false);
  });

  it('setSidebarCollapsed đặt giá trị tuyệt đối, gọi lại không đảo ngược', () => {
    let state = appReducer(initial(), setSidebarCollapsed(true));
    state = appReducer(state, setSidebarCollapsed(true));

    expect(state.sidebarCollapsed).toBe(true);
  });

  it('không đụng tới các field khác của vỏ', () => {
    const state = appReducer(initial(), toggleSidebar());

    expect(state.mobileNavOpen).toBe(false);
    expect(state.themeMode).toBe(THEME_MODE.LIGHT);
  });

  it('drawer mobile và sidebar desktop là hai state ĐỘC LẬP', () => {
    // Mở drawer trên mobile không được ngầm thu gọn sidebar desktop và ngược lại.
    let state = appReducer(initial(), setMobileNavOpen(true));
    state = appReducer(state, toggleSidebar());

    expect(state.mobileNavOpen).toBe(true);
    expect(state.sidebarCollapsed).toBe(true);
  });
});

describe('app.slice — chưa có persistence', () => {
  it('reducer là hàm thuần: không đọc/ghi storage nào', () => {
    const getItem = globalThis.localStorage?.getItem;
    let touched = false;
    if (globalThis.localStorage) {
      globalThis.localStorage.getItem = ((key: string) => {
        touched = true;
        return getItem?.call(globalThis.localStorage, key) ?? null;
      }) as typeof globalThis.localStorage.getItem;
    }

    appReducer(appReducer(initial(), toggleSidebar()), setThemeMode(THEME_MODE.DARK));

    if (globalThis.localStorage && getItem) globalThis.localStorage.getItem = getItem;
    expect(touched).toBe(false);
  });

  it('hình dạng state chỉ có 3 field — thêm field mới phải sửa test này', () => {
    // Nếu sau này có persistence thật, đây là chỗ phải cân nhắc bản đã lưu của người dùng cũ.
    expect(Object.keys(initial()).sort()).toEqual([
      'mobileNavOpen',
      'sidebarCollapsed',
      'themeMode',
    ]);
  });
});
