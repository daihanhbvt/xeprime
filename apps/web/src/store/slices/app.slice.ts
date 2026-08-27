import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * State UI toàn cục — ADR 0004.
 *
 * Chỉ được chứa thứ không thuộc TanStack Query (server data), React Hook Form (form) hay
 * URL searchParams (filter/paging). Thêm field mới phải trả lời được câu hỏi đó.
 */
export const THEME_MODE = {
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE];

export interface AppState {
  sidebarCollapsed: boolean;
  /**
   * Khối menu (`NavSection.key`) người dùng đã GẬP LẠI — lưu phía phủ định để mặc định
   * "chưa chọn gì" là mọi khối mở, và để khối mới thêm về sau không bị ẩn mất vì nó không có
   * trong danh sách đã lưu của người dùng cũ.
   */
  navSectionsCollapsed: string[];
  /** Sidebar dạng Drawer trên màn hình hẹp. */
  mobileNavOpen: boolean;
  themeMode: ThemeMode;
}

const initialState: AppState = {
  sidebarCollapsed: false,
  navSectionsCollapsed: [],
  mobileNavOpen: false,
  themeMode: THEME_MODE.LIGHT,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    /** Gập/mở một khối menu. Khối chứa trang đang mở vẫn luôn được bung ra lúc render. */
    toggleNavSection(state, action: PayloadAction<string>) {
      const key = action.payload;
      state.navSectionsCollapsed = state.navSectionsCollapsed.includes(key)
        ? state.navSectionsCollapsed.filter((item) => item !== key)
        : [...state.navSectionsCollapsed, key];
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarCollapsed,
  toggleNavSection,
  setMobileNavOpen,
  setThemeMode,
} = appSlice.actions;

export const appReducer = appSlice.reducer;
