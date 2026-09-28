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
 * Layout gốc của XePrime PARTNER — cùng dàn provider với app Customer (xem docblock đầy đủ ở
 * `apps/mobile/customer/app/_layout.tsx`), trừ hai chỗ CỐ Ý khác:
 *
 *  - KHÔNG có `ShopAccountGate`: app này không có khu khách để phải đẩy ai ra khỏi đó.
 *  - KHÔNG có màn `register`: XePrime Partner không đăng ký tài khoản mới — hồ sơ gian hàng
 *    mở từ app XePrime (Customer) rồi handoff sang đây.
 */
registerPushBackgroundHandler();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorScreen error={error} onRetry={() => void retry()} />;
}

export default function RootLayout() {
  useAppFonts();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <ReduxProvider store={store}>
          <I18nProvider>
            <QueryClientProvider client={queryClient}>
              <AppToastProvider>
                <PushBootstrap />
                <InAppCameraProvider />
                <SessionBoundary>
                  <ChatRealtimeProvider>
                    <BadgeRealtimeProvider>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          animation: 'ios_from_right',
                          gestureEnabled: true,
                          contentStyle: { backgroundColor: colors.background },
                        }}
                      >
                        <Stack.Screen
                          name="login"
                          options={{ animation: 'slide_from_bottom', animationDuration: duration.slow }}
                        />
                        <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
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
