import { useFormatter, useLocale, useTranslations } from 'use-intl';
import { useMemo } from 'react';
import { createAppFormat, DATE_PATTERN, type AppFormat } from './app-format';
import type { AppLocale } from './config';
import { useDomainLabel } from './domain';

export { DATE_PATTERN, type AppFormat, type AppFormatter, type CommonTranslator } from './app-format';

export function useDatePickerPattern(): (typeof DATE_PATTERN)[AppLocale] {
  return DATE_PATTERN[useLocale() as AppLocale];
}

export function useAppFormat(): AppFormat {
  const locale = useLocale() as AppLocale;
  const format = useFormatter();
  const t = useTranslations('Common');
  const domainLabel = useDomainLabel();

  return useMemo(
    () => createAppFormat(locale, format, t, domainLabel),
    [domainLabel, format, locale, t],
  );
}
