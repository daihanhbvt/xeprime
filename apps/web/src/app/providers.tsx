'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider, theme as antdThemeEngine, type ThemeConfig } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import type { Locale as AntdLocale } from 'antd/lib/locale';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import { useLocale } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { ChatRealtimeProvider } from '@/features/chat/context/ChatRealtimeContext';
import { BadgeRealtimeProvider } from '@/features/badges/BadgeRealtimeProvider';
import type { AppLocale } from '@/i18n/config';
import { useZoneQueryClient } from '@/lib/query-client';
import type { NavPreferences } from '@/lib/ui-preferences';
import { ThemeProvider, useTheme, type ThemeMode } from '@/lib/theme';
import { WorkspaceProvider } from '@/hooks/use-workspace';
import { makeStore } from '@/store/make-store';
import { antdDarkTokens, antdTheme } from '@/styles/theme';
import type { Zone } from '@/zones';

/**
 * Chỉ NẠP ĐỊNH NGHĨA locale của Day.js, KHÔNG gọi `dayjs.locale(...)`.
 *
 * `dayjs.locale('vi')` đổi trạng thái TOÀN TIẾN TRÌNH. File này có `'use client'` nhưng vẫn
 * chạy trên server lúc SSR, nơi một tiến trình phục vụ nhiều request song song — một request
 * tiếng Anh sẽ đổi locale của request tiếng Việt đang render dở. Chỗ nào cần chữ theo ngôn ngữ
 * thì dùng formatter của next-intl (`useFormatter`), chỗ nào buộc phải qua Day.js thì gọi
 * `.locale(x)` trên từng instance. Phép tính ngày giờ của Day.js không phụ thuộc locale nên
 * không có gì đổi.
 */

/** Locale của Ant Design theo ngôn ngữ giao diện — DatePicker, Table, Pagination, Empty… */
const ANTD_LOCALE: Readonly<Record<AppLocale, AntdLocale>> = {
  vi: viVN,
  en: enUS,
};

/**
 * Theme AntD theo giao diện. Bản tối phải ghi đè cả token MÀU, không chỉ đổi `algorithm`:
 * `antdTheme` set tường minh màu sáng và token tường minh thắng thuật toán (xem `XP_DARK_TOKENS`).
 */
const ANTD_THEME: Readonly<Record<ThemeMode, ThemeConfig>> = {
  light: antdTheme,
  dark: {
    ...antdTheme,
    algorithm: antdThemeEngine.darkAlgorithm,
    token: { ...antdTheme.token, ...antdDarkTokens },
  },
};

export interface ProvidersProps {
  children: ReactNode;
  /**
   * Tuỳ chọn giao diện của vỏ quản lý, đọc từ cookie phía server (`getServerNavPreferences`).
   * Đi thẳng vào store lúc TẠO để lần render đầu trên server và trên client khớp nhau — dispatch
   * sau khi hydrate sẽ làm sidebar nhấp nháy ở mọi lần tải trang.
   */
  navPreferences?: NavPreferences;
  /**
   * Khu theo HOST của request (root layout đọc header) — chế độ `host` dùng nó để chọn QueryClient
   * của khu (`useZoneQueryClient`); chế độ `path` đọc khu từ đường dẫn.
   */
  hostZone: Zone;
  /**
   * Tuỳ chọn giao diện sáng/tối từ cookie phía server.
   */
  initialTheme?: ThemeMode;
}

export function Providers({ children, navPreferences, hostZone, initialTheme }: ProvidersProps) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <ProvidersInner navPreferences={navPreferences} hostZone={hostZone}>
        {children}
      </ProvidersInner>
    </ThemeProvider>
  );
}

function ProvidersInner({
  children,
  navPreferences,
  hostZone,
}: Omit<ProvidersProps, 'initialTheme'>) {
  const locale = useLocale();
  const { theme: currentTheme } = useTheme();

  // makeStore tạo trong state chứ không phải module scope: module scope là singleton dùng chung
  // giữa các request trên server, tức là rò dữ liệu giữa người dùng.
  const [store] = useState(() => makeStore(navPreferences));
  // MỘT QueryClient cho MỖI khu — mỗi site là một tài khoản riêng (ADR 0053), xem `useZoneQueryClient`.
  const queryClient = useZoneQueryClient(hostZone);

  return (
    <AntdRegistry>
      <ConfigProvider theme={ANTD_THEME[currentTheme]} locale={ANTD_LOCALE[locale]}>
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <AntdApp>
              <WorkspaceProvider>
                <ChatRealtimeProvider>
                  <BadgeRealtimeProvider>{children}</BadgeRealtimeProvider>
                </ChatRealtimeProvider>
              </WorkspaceProvider>
            </AntdApp>
          </QueryClientProvider>
        </ReduxProvider>
      </ConfigProvider>
    </AntdRegistry>
  );
}
