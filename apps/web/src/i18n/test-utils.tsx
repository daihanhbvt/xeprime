import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, createFormatter, createTranslator } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

import enMessages from '../../messages/en';
import viMessages from '../../messages/vi';
import { formats } from './formats';
import { APP_TIME_ZONE, DEFAULT_LOCALE, type AppLocale } from './config';
import { createDomainLabel } from './domain';
import { createAppFormat, type AppFormat } from './app-format';

/**
 * Bọc test bằng ĐÚNG bó message thật, không phải message giả.
 *
 * Cố ý dùng file JSON thật: một test render bằng message giả sẽ xanh ngay cả khi khoá bị xoá
 * khỏi bó thật — tức là nó khoá đúng thứ không quan trọng. Vì tiếng Việt là mặc định, test
 * hiện có (vốn tìm phần tử bằng nhãn tiếng Việt) chạy tiếp không cần sửa.
 *
 * Múi giờ ghim `Asia/Ho_Chi_Minh` cho mọi test, khớp cấu hình request: nếu không, cùng một
 * mốc thời gian sẽ hiển thị khác nhau tuỳ máy chạy CI nằm ở đâu.
 */
const MESSAGES: Readonly<Record<AppLocale, typeof viMessages>> = {
  vi: viMessages,
  en: enMessages as typeof viMessages,
};

export interface IntlRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: AppLocale;
  /**
   * Mốc "bây giờ" cố định cho `format.relativeTime`. Không đặt thì next-intl dùng đồng hồ
   * thật, và test thời gian tương đối sẽ nhấp nháy.
   */
  now?: Date;
}

export function IntlTestProvider({
  children,
  locale = DEFAULT_LOCALE,
  now,
}: {
  children: ReactNode;
  locale?: AppLocale;
  now?: Date;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      formats={formats}
      timeZone={APP_TIME_ZONE}
      now={now}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/** `render` của testing-library, đã bọc sẵn provider đa ngữ. */
export function renderWithIntl(ui: ReactElement, options: IntlRenderOptions = {}): RenderResult {
  const { locale, now, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <IntlTestProvider locale={locale} now={now}>
        {children}
      </IntlTestProvider>
    ),
    ...rest,
  });
}

/** Wrapper cho `renderHook` — cùng provider, cùng lý do. */
export function intlWrapper(locale: AppLocale = DEFAULT_LOCALE) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <IntlTestProvider locale={locale}>{children}</IntlTestProvider>;
  };
}

/**
 * Bộ định dạng dùng cho test của SERVER Component.
 *
 * `getAppFormat()` gọi `getLocale()` của next-intl, và API đó ném ngay khi chạy ngoài môi
 * trường react-server — tức là trong mọi test jsdom. Nên test mock `@/i18n/server-format` và
 * trả về hàm này.
 *
 * Nó dựng bằng CHÍNH `createAppFormat` và CHÍNH bó message thật, chỉ khác nguồn locale/formatter,
 * nên nó vẫn khoá đúng hành vi production chứ không phải một bản giả cho qua chuyện.
 */
export function createTestAppFormat(locale: AppLocale = DEFAULT_LOCALE): AppFormat {
  const shared = { locale, messages: MESSAGES[locale], formats, timeZone: APP_TIME_ZONE };
  return createAppFormat(
    locale,
    createFormatter(shared),
    createTranslator({ ...shared, namespace: 'Common' }) as never,
    createDomainLabel(createTranslator({ ...shared, namespace: 'Domain' }) as never),
  );
}

/**
 * `getTranslations` của next-intl cho test — cùng lý do như `createTestAppFormat`: API server
 * ném khi chạy ngoài môi trường react-server, tức là trong mọi test jsdom.
 *
 *   vi.mock('next-intl/server', async () => {
 *     const { serverTranslationsStub } = await import('@/i18n/test-utils');
 *     return serverTranslationsStub('vi');
 *   });
 */
export function serverTranslationsStub(locale: AppLocale = DEFAULT_LOCALE) {
  const shared = { locale, messages: MESSAGES[locale], formats, timeZone: APP_TIME_ZONE };
  return {
    getLocale: async () => locale,
    getFormatter: async () => createFormatter(shared),
    getTranslations: async (namespace?: string) =>
      /*
       * `createTranslator` phân biệt overload có/không namespace bằng KIỂU, nên nhánh không
       * namespace phải gọi riêng thay vì spread có điều kiện.
       */
      namespace
        ? createTranslator({ ...shared, namespace: namespace as never })
        : createTranslator(shared),
  };
}
