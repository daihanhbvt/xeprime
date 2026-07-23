'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { makeStore } from '@/store/make-store';
import { antdTheme } from '@/styles/theme';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('vi');

/**
 * Thứ tự bọc có ý nghĩa:
 *   AntdRegistry  — thu style CSS-in-JS của AntD lúc SSR, phải nằm ngoài cùng
 *   ConfigProvider — design token + locale tiếng Việt
 *   ReduxProvider  — UI state
 *   QueryClient    — server data
 *
 * ADR 0003: không có StyledComponentsRegistry ở đây. Style riêng dùng CSS Modules,
 * nên chỉ còn đúng một cơ chế thu style SSR.
 */
export function Providers({ children }: { children: ReactNode }) {
  // makeStore/QueryClient tạo trong state chứ không phải module scope: module scope là
  // singleton dùng chung giữa các request trên server, tức là rò dữ liệu giữa người dùng.
  const [store] = useState(makeStore);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // 401/403 retry là vô nghĩa và làm chậm việc hiện màn đăng nhập.
              const status = (error as { status?: number }).status;
              if (status === 401 || status === 403) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <AntdRegistry>
      <ConfigProvider theme={antdTheme} locale={viVN}>
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <AntdApp>{children}</AntdApp>
          </QueryClientProvider>
        </ReduxProvider>
      </ConfigProvider>
    </AntdRegistry>
  );
}
