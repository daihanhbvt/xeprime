import { configureStore } from '@reduxjs/toolkit';

import { appReducer } from './slices/app.slice';
import { calendarUiReducer } from './slices/calendar-ui.slice';
import { scopeReducer } from './slices/scope.slice';

/**
 * ADR 0004 + khuyến nghị Redux Toolkit cho App Router: tạo store MỚI mỗi request.
 *
 * Singleton ở module scope sẽ bị dùng chung giữa các request trên server và làm rò state
 * của người dùng này sang người dùng khác.
 */
export const makeStore = () =>
  configureStore({
    reducer: {
      app: appReducer,
      scope: scopeReducer,
      calendarUi: calendarUiReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
