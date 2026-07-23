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
  /** Sidebar dạng Drawer trên màn hình hẹp. */
  mobileNavOpen: boolean;
  themeMode: ThemeMode;
}

const initialState: AppState = {
  sidebarCollapsed: false,
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
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
  },
});

export const { toggleSidebar, setSidebarCollapsed, setMobileNavOpen, setThemeMode } =
  appSlice.actions;

export const appReducer = appSlice.reducer;
