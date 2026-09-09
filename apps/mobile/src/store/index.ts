import { configureStore } from '@reduxjs/toolkit';
import { localeReducer } from '@/i18n/locale.slice';
import { branchScopeReducer } from '@/features/branches/branch-scope.slice';
import { shellScopeReducer } from '@/features/shell/shell-scope.slice';

/**
 * Store chỉ đăng ký reducer; slice thuộc quyền sở hữu của chính tính năng sinh ra nó. Nhờ vậy
 * phụ thuộc chỉ đi MỘT chiều `store → feature`, không thành vòng.
 */
export const store = configureStore({
  reducer: {
    locale: localeReducer,
    shellScope: shellScopeReducer,
    branchScope: branchScopeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
