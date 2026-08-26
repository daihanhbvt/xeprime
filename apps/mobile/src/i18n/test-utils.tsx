import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import { TamaguiProvider } from 'tamagui';
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
 */
export function withIntl(children: ReactNode, locale: AppLocale = DEFAULT_LOCALE) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <IntlProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone={APP_TIME_ZONE}
        formats={formats}
      >
        {children}
      </IntlProvider>
    </TamaguiProvider>
  );
}
