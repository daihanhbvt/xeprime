// PHẢI đứng đầu, trước mọi import khác: các module bên dưới đụng `Intl` ngay lúc nạp, còn
// Hermes trên Android thiếu `Intl.PluralRules` và bảng múi giờ. Xem `src/i18n/intl-polyfill.ts`.
import '@/i18n/intl-polyfill';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';
import { TamaguiProvider } from 'tamagui';
// Side-effect import, KHÔNG xoá: expo-router dùng reanimated cho animation của navigator.
import 'react-native-reanimated';

import { AppErrorScreen } from '@/components/state/AppErrorScreen';
import { AppToastProvider } from '@/components/feedback/AppToast';
import { SessionBoundary } from '@/features/auth/SessionBoundary';
import { I18nProvider } from '@/i18n/I18nProvider';
import { queryClient } from '@/queries/query-client';
import { store } from '@/store';
import { useAppFonts } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { tamaguiConfig } from '@/theme/tamagui.config';
import { duration } from '@/theme/motion';

/**
 * expo-router bắt lỗi render của cả cây qua export TÊN `ErrorBoundary` ở layout gốc. Nó nằm
 * NGOÀI các provider bên dưới (lỗi có thể đến từ chính chúng), nên `AppErrorScreen` phải tự
 * dựng lại provider nào nó cần.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorScreen error={error} onRetry={() => void retry()} />;
}

export default function RootLayout() {
  // Không chặn render theo kết quả: chữ hiện ngay bằng font hệ thống rồi đổi mặt — xem docblock.
  useAppFonts();

  return (
    // `initialMetrics` lấy inset đồng bộ lúc khởi động; thiếu nó thì frame đầu render với
    // inset = 0 rồi nhảy khi giá trị thật về từ native.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <ReduxProvider store={store}>
          <I18nProvider>
            <QueryClientProvider client={queryClient}>
              {/*
                Trong `SafeAreaProvider` (viewport cần inset thật) và BAO NGOÀI `Stack`: toast
                phải sống sót qua điều hướng — bắn một thông báo rồi `router.replace` mà provider
                nằm trong màn hình thì nó bị tháo cùng màn đó và người dùng không kịp đọc gì.
              */}
              <AppToastProvider>
              <SessionBoundary>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    // `ios_from_right` chứ không phải `slide_from_right`: bản kia giữ màn cũ đứng
                    // yên nên lúc lui, màn dưới bật ra nguyên khối và đọc thành một cú nháy.
                    // Không đặt `animationDuration` — nó chạy theo đường cong native.
                    animation: 'ios_from_right',
                    gestureEnabled: true,
                    // KHÔNG bật `freezeOnBlur`: chi phí dựng lại cây rơi đúng vào khung hình
                    // của animation lui — push mượt hơn chút, pop giật hẳn.
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
                  {/* Đăng nhập là việc chen ngang rồi quay lại, không phải một nấc sâu hơn. */}
                  <Stack.Screen
                    name="login"
                    options={{ animation: 'slide_from_bottom', animationDuration: duration.slow }}
                  />
                  {/*
                    Chặng quay về của đăng nhập mạng xã hội. `animation: none` vì màn này chỉ
                    tồn tại vài trăm mili giây trước khi `enterApp()` đóng nó — một cú trượt
                    ở đây là chuyển động cho một thứ người dùng không cần thấy.
                  */}
                  <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                </Stack>
              </SessionBoundary>
              </AppToastProvider>
            </QueryClientProvider>
          </I18nProvider>
        </ReduxProvider>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}
