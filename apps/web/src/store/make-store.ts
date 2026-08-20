import { configureStore } from '@reduxjs/toolkit';

import type { NavPreferences } from '@/lib/ui-preferences';
import { appReducer, type AppState } from './slices/app.slice';
import { calendarUiReducer } from './slices/calendar-ui.slice';
import { scopeReducer } from './slices/scope.slice';

/**
 * ADR 0004 + khuyến nghị Redux Toolkit cho App Router: tạo store MỚI mỗi request.
 *
 * Singleton ở module scope sẽ bị dùng chung giữa các request trên server và làm rò state
 * của người dùng này sang người dùng khác.
 *
 * `navPreferences` là tuỳ chọn giao diện đọc từ cookie PHÍA SERVER (`getServerNavPreferences`).
 * Nó phải đi vào state ngay lúc tạo store chứ không dispatch sau khi hydrate: cùng một giá trị
 * cho cả lần render trên server lẫn trên client là điều kiện để không lệch hydrate và không
 * nhấp nháy sidebar.
 */
export const makeStore = (navPreferences?: NavPreferences) =>
  configureStore({
    reducer: {
      app: appReducer,
      scope: scopeReducer,
      calendarUi: calendarUiReducer,
    },
    preloadedState: navPreferences
      ? {
          app: {
            ...(appReducer(undefined, { type: '@@INIT' }) as AppState),
            sidebarCollapsed: navPreferences.sidebarCollapsed,
            navSectionsCollapsed: [...navPreferences.navSectionsCollapsed],
          },
        }
      : undefined,
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
