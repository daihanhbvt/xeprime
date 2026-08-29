'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { API_ERROR_CODE } from '@xeprime/types';
import { App as AntdApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import type { Locale as AntdLocale } from 'antd/lib/locale';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import { useLocale } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { ChatRealtimeProvider } from '@/features/chat/context/ChatRealtimeContext';
import type { AppLocale } from '@/i18n/config';
import type { NavPreferences } from '@/lib/ui-preferences';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { makeStore } from '@/store/make-store';
import { antdTheme } from '@/styles/theme';

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
 * Thứ tự bọc có ý nghĩa:
 *   AntdRegistry  — thu style CSS-in-JS của AntD lúc SSR, phải nằm ngoài cùng
 *   ConfigProvider — design token + locale AntD theo ngôn ngữ đang dùng
 *   ReduxProvider  — UI state
 *   QueryClient    — server data
 *
 * `NextIntlClientProvider` nằm NGOÀI cụm này (ở `layout.tsx`, phía server) nên `useLocale()`
 * dùng được ở đây, và bó message không phải đi qua một client boundary thừa.
 *
 * ADR 0003: không có StyledComponentsRegistry ở đây. Style riêng dùng CSS Modules,
 * nên chỉ còn đúng một cơ chế thu style SSR.
 */
export interface ProvidersProps {
  children: ReactNode;
  /**
   * Tuỳ chọn giao diện của vỏ quản lý, đọc từ cookie phía server (`getServerNavPreferences`).
   * Đi thẳng vào store lúc TẠO để lần render đầu trên server và trên client khớp nhau — dispatch
   * sau khi hydrate sẽ làm sidebar nhấp nháy ở mọi lần tải trang.
   */
  navPreferences?: NavPreferences;
}

export function Providers({ children, navPreferences }: ProvidersProps) {
  const locale = useLocale();

  // makeStore/QueryClient tạo trong state chứ không phải module scope: module scope là
  // singleton dùng chung giữa các request trên server, tức là rò dữ liệu giữa người dùng.
  const [store] = useState(() => makeStore(navPreferences));
  const [queryClient] = useState(() => {
    /*
     * Tự chữa chiều lệch NGUY HIỂM của cache năng lực (ADR 0027): client tin là còn quyền, server
     * nói đã hết. Hai mã này chỉ xuất hiện khi cờ tính năng của gian hàng đã đổi mà `/auth/me`
     * trong cache còn nói khác — làm mới nó ngay là menu và nút bấm khớp lại trong một nhịp.
     *
     * KHÔNG hạ `staleTime` toàn cục để chữa việc này: khoá `auth.me` dùng chung với danh tính và
     * quyền, hạ xuống là gấp ba lưu lượng `/auth/me` của MỌI người dùng để chữa một độ trễ 60
     * giây thuần hiển thị. Chiều ngược lại (server mở lại quyền TRƯỚC client) đã có nút "Tôi đã
     * gia hạn" ở `FeatureExpiredNotice`.
     *
     * Không có vòng lặp: `/auth/me` không mang `@RequiresFeature` nên nó không bao giờ là nguồn
     * của hai mã này.
     */
    const refreshMeOnFeatureChange = (error: unknown): void => {
      const code = getErrorCode(error);
      if (
        code === API_ERROR_CODE.FEATURE_READ_ONLY ||
        code === API_ERROR_CODE.FEATURE_NOT_IN_PLAN
      ) {
        void client.invalidateQueries({ queryKey: queryKeys.auth.me() });
      }
    };

    const client = new QueryClient({
      queryCache: new QueryCache({ onError: refreshMeOnFeatureChange }),
      mutationCache: new MutationCache({ onError: refreshMeOnFeatureChange }),
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
    });
    return client;
  });

  return (
    <AntdRegistry>
      <ConfigProvider theme={antdTheme} locale={ANTD_LOCALE[locale]}>
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <AntdApp>
              <ChatRealtimeProvider>{children}</ChatRealtimeProvider>
            </AntdApp>
          </QueryClientProvider>
        </ReduxProvider>
      </ConfigProvider>
    </AntdRegistry>
  );
}
