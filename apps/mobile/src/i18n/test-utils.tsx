import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import { AppToastProvider } from '@/components/feedback/AppToast';
import { tamaguiConfig } from '@/theme/tamagui.config';
import { APP_TIME_ZONE, DEFAULT_LOCALE, type AppLocale } from './config';
import { formats } from './formats';
import { MESSAGES } from './messages';

/**
 * Bọc component dưới các provider mà MỌI màn hình đều có thật.
 *
 * `TamaguiProvider` nằm ở đây chứ không phải từng test: component nào dùng `XStack`/`Text` của
 * Tamagui mà thiếu provider sẽ ném "Missing tamagui config" — lỗi trỏ vào thư viện chứ không
 * vào component, nên rất tốn công truy nếu mỗi test tự lo.
 *
 * `formats` cũng phải có: thiếu nó thì `format.dateTime(d, 'short')` không tìm ra preset và
 * test đọc ngày sẽ khác hẳn app thật.
 *
 * `AppToastProvider` cũng vậy: component nào gọi `useAppToast()` mà thiếu nó sẽ ném từ trong
 * lòng Tamagui, và test khẳng định "có hiện thông báo lỗi" cần chính viewport này để đọc được.
 * Nó kéo theo `SafeAreaProvider` — viewport toast đọc inset thật để không chui vào tai thỏ, và
 * `useSafeAreaInsets()` ném nếu không có provider. `initialMetrics` cho inset 0 tất định thay
 * vì để test chờ một giá trị native không bao giờ về.
 */
export function withIntl(children: ReactNode, locale: AppLocale = DEFAULT_LOCALE) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <IntlProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone={APP_TIME_ZONE}
        formats={formats}
      >
        <AppToastProvider>{children}</AppToastProvider>
      </IntlProvider>
    </TamaguiProvider>
    </SafeAreaProvider>
  );
}
