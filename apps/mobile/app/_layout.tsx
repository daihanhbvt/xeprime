import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';
// Side-effect import, KHÔNG xoá: expo-router dùng reanimated cho animation của navigator.
import 'react-native-reanimated';

import { AppErrorScreen } from '@/components/state/AppErrorScreen';
import { SessionBoundary } from '@/features/auth/SessionBoundary';
import { I18nProvider } from '@/i18n/I18nProvider';
import { queryClient } from '@/queries/query-client';
import { store } from '@/store';

/**
 * expo-router bắt lỗi render của cả cây qua export TÊN `ErrorBoundary` ở layout gốc. Nó nằm
 * NGOÀI các provider bên dưới (lỗi có thể đến từ chính chúng), nên `AppErrorScreen` phải tự
 * dựng lại provider nào nó cần.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorScreen error={error} onRetry={() => void retry()} />;
}

export default function RootLayout() {
  return (
    // `initialMetrics` lấy inset đồng bộ lúc khởi động; thiếu nó thì frame đầu render với
    // inset = 0 rồi nhảy khi giá trị thật về từ native.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ReduxProvider store={store}>
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <SessionBoundary>
              <Stack screenOptions={{ headerShown: false }} />
            </SessionBoundary>
          </QueryClientProvider>
        </I18nProvider>
      </ReduxProvider>
    </SafeAreaProvider>
  );
}
