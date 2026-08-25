import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import { APP_TIME_ZONE, DEFAULT_LOCALE, type AppLocale } from './config';
import { MESSAGES } from './messages';

export function withIntl(children: ReactNode, locale: AppLocale = DEFAULT_LOCALE) {
  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone={APP_TIME_ZONE}>
      {children}
    </IntlProvider>
  );
}
