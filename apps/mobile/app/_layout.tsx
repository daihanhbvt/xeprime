// PHẢI đứng đầu, trước mọi import khác: các module bên dưới đụng `Intl` ngay lúc nạp, còn
// Hermes trên Android thiếu `Intl.PluralRules` và bảng múi giờ. Xem `src/i18n/intl-polyfill.ts`.
import '@/i18n/intl-polyfill';

import '@/lib/crypto-polyfill';

import { patchDayjsTimezone } from '@/i18n/dayjs-timezone-fix';

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
import { BadgeRealtimeProvider } from '@/features/badges/BadgeRealtimeProvider';
import { InAppCameraProvider } from '@/features/camera/InAppCameraProvider';
import { ChatRealtimeProvider } from '@/features/chat/realtime/ChatRealtimeProvider';
import { registerPushBackgroundHandler } from '@/features/notifications/messaging';
import { PushBootstrap } from '@/features/notifications/PushBootstrap';
import { I18nProvider } from '@/i18n/I18nProvider';
import { queryClient } from '@/queries/query-client';
import { store } from '@/store';
import { useAppFonts } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { tamaguiConfig } from '@/theme/tamagui.config';
import { duration } from '@/theme/motion';

patchDayjsTimezone();

/*
 * KHÔNG gọi `SplashScreen.preventAutoHideAsync()` ở đây — và đừng thêm vào sau.
 *
 * Splash được khai ở `app.json` (`expo-splash-screen`) để lấp đúng một khoảng: từ lúc hệ điều
 * hành mở process tới khi khung hình React đầu tiên vẽ xong. Hết khoảng đó nó tự ẩn.
 *
 * Giữ nó lâu hơn để chờ font hoặc chờ phiên là đổi một nhấp nháy ngắn lấy một màn chờ dài, đúng
 * cái đánh đổi mà `src/theme/fonts.ts` đã từ chối: font chưa về thì chữ hiện bằng font hệ thống
 * rồi đổi mặt, còn phiên thì `SessionBoundary` không chặn render bao giờ. Màu nền splash đặt
 * bằng `colors.background` (#faf9f7) nên cú bàn giao sang app không có bước nhảy màu.
 */

/*
 * Ở phạm vi MODULE, ngoài mọi component: khi hệ điều hành đánh thức app bằng một headless task
 * để giao thông báo, không có cây React nào được dựng. No-op nếu bản build không có module
 * Firebase Messaging (Expo Go, bản web, bản build chưa có credential).
 */
registerPushBackgroundHandler();

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
                <PushBootstrap />
                {/*
                  Máy ảnh TRONG app, mount một lần ở đây vì nơi gọi là `pickImages` — một hàm
                  async trong `src/lib`, không phải component (xem `in-app-camera.ts`). Bọc cả
                  `Stack` để khung ngắm sống qua điều hướng. Không vẽ gì khi chưa ai gọi.
                */}
                <InAppCameraProvider />
              <SessionBoundary>
                {/*
                  BÊN TRONG `SessionBoundary`: nó cần phiên (custom token xin bằng chính phiên
                  đó) và phải nghe được lúc phiên đổi. Bọc cả `Stack` để listener Firestore sống
                  qua điều hướng — gắn nó ở một màn thì rời màn là mất realtime.
                */}
                <ChatRealtimeProvider>
                {/*
                  BÊN TRONG `ChatRealtimeProvider`: nó dùng lại ĐÚNG phiên Firebase của chat để nghe
                  `user_badges/{uid}`. Mở phiên thứ hai chỉ để nghe một document là trả tiền hai
                  lần cho đúng một kết nối.

                  Và bọc cả `Stack`: chuông, biểu tượng chat và huy hiệu menu đều đọc con số
                  này, nên nó phải sống qua điều hướng — gắn ở một màn thì rời màn là mất.
                */}
                <BadgeRealtimeProvider>
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
                    Đăng ký dùng CÙNG chuyển cảnh với đăng nhập: hai màn là hai chế độ của một
                    việc (web dựng chúng trong cùng một modal), và chúng thay thế nhau bằng
                    `replace` — một đường cong khác ở đây sẽ đọc thành "đi sâu thêm một nấc".
                  */}
                  <Stack.Screen
                    name="register"
                    options={{ animation: 'slide_from_bottom', animationDuration: duration.slow }}
                  />
                  {/*
                    Chặng quay về của đăng nhập mạng xã hội. `animation: none` vì màn này chỉ
                    tồn tại vài trăm mili giây trước khi `enterApp()` đóng nó — một cú trượt
                    ở đây là chuyển động cho một thứ người dùng không cần thấy.
                  */}
                  <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                  {/*
                    Khu quản lý là một KHU khác, không phải một nấc sâu hơn của khu khách — đổi
                    khu dùng `fade` y như `(tabs)`, để cú chuyển đọc thành "thay cả màn" chứ
                    không phải "đi tiếp".
                  */}
                  <Stack.Screen name="manage" options={{ animation: 'fade' }} />
                </Stack>
                </BadgeRealtimeProvider>
                </ChatRealtimeProvider>
              </SessionBoundary>
              </AppToastProvider>
            </QueryClientProvider>
          </I18nProvider>
        </ReduxProvider>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}
