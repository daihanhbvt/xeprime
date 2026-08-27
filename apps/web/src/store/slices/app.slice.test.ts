import { describe, expect, it } from 'vitest';

import { makeStore } from '../make-store';
import {
  appReducer,
  setMobileNavOpen,
  setSidebarCollapsed,
  setThemeMode,
  toggleNavSection,
  toggleSidebar,
  THEME_MODE,
  type AppState,
} from './app.slice';

/**
 * State UI của vỏ portal.
 *
 * **Persistence sống ở tầng cookie, KHÔNG ở reducer.** `sidebarCollapsed` và
 * `navSectionsCollapsed` được đọc từ cookie `XP_NAV` PHÍA SERVER và nạp vào store lúc tạo
 * (`getServerNavPreferences` → `makeStore(navPreferences)`); chiều ghi nằm ở
 * `useNavPreferencesSync`. Nhờ vậy giá trị đã đúng ngay từ HTML đầu tiên: không có
 * hydration mismatch, không có cú nhảy bố cục khi trang vừa tải — thứ mà một bản
 * `localStorage` (chỉ đọc được sau hydrate) buộc phải đánh đổi.
 *
 * Test dưới đây khoá cả hai mặt: mặc định đúng, và reducer vẫn THUẦN (không tự đọc/ghi
 * storage nào).
 */

const initial = (): AppState => appReducer(undefined, { type: '@@INIT' });

describe('app.slice — mặc định', () => {
  it('sidebar mở, drawer đóng, theme sáng', () => {
    expect(initial()).toEqual({
      sidebarCollapsed: false,
      navSectionsCollapsed: [],
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

describe('app.slice — gập khối menu', () => {
  it('toggleNavSection lật qua lại, lưu ở phía PHỦ ĐỊNH (chỉ khối đã gập)', () => {
    let state = appReducer(initial(), toggleNavSection('settings'));
    expect(state.navSectionsCollapsed).toEqual(['settings']);

    state = appReducer(state, toggleNavSection('settings'));
    expect(state.navSectionsCollapsed).toEqual([]);
  });

  it('gập nhiều khối độc lập với nhau', () => {
    let state = appReducer(initial(), toggleNavSection('settings'));
    state = appReducer(state, toggleNavSection('business'));

    expect(state.navSectionsCollapsed).toEqual(['settings', 'business']);
  });

  it('khối MỚI thêm về sau mặc định vẫn mở với người dùng cũ', () => {
    // Chính là lý do lưu phía phủ định: bản đã lưu của người dùng cũ không liệt kê khối mới,
    // nên khối mới không bị ẩn mất một cách khó hiểu.
    const state = appReducer(initial(), toggleNavSection('settings'));

    expect(state.navSectionsCollapsed).not.toContain('storefront');
  });

  it('gập khối KHÔNG đụng tới trạng thái thu gọn của sidebar', () => {
    const state = appReducer(initial(), toggleNavSection('operations'));

    expect(state.sidebarCollapsed).toBe(false);
  });
});

describe('app.slice — reducer thuần', () => {
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

  it('hình dạng state chỉ có 4 field — thêm field mới phải sửa test này', () => {
    // Thêm field ở đây là phải trả lời: nó có thuộc bản lưu cookie không, và bản đã lưu của
    // người dùng cũ (thiếu field đó) có còn đọc được không.
    expect(Object.keys(initial()).sort()).toEqual([
      'mobileNavOpen',
      'navSectionsCollapsed',
      'sidebarCollapsed',
      'themeMode',
    ]);
  });

  it('makeStore nhận tuỳ chọn đọc từ cookie và nạp thẳng vào state', () => {
    const store = makeStore({ sidebarCollapsed: true, navSectionsCollapsed: ['settings'] });

    expect(store.getState().app.sidebarCollapsed).toBe(true);
    expect(store.getState().app.navSectionsCollapsed).toEqual(['settings']);
    // Các field còn lại vẫn là mặc định — cookie chỉ mang tuỳ chọn điều hướng.
    expect(store.getState().app.themeMode).toBe(THEME_MODE.LIGHT);
  });
});
