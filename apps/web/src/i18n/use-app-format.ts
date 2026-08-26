'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DATE_PATTERN, createAppFormat, type AppFormat } from './app-format';
import type { AppLocale } from './config';
import { useDomainLabel } from './use-domain-label';

export {
  DATE_PATTERN,
  type AppFormat,
  type AppFormatter,
  type CommonTranslator,
} from './app-format';

export function useDatePickerPattern(): (typeof DATE_PATTERN)[AppLocale] {
  return DATE_PATTERN[useLocale()];
}

/** Bộ định dạng cho Client Component. Server Component dùng `getAppFormat()`. */
export function useAppFormat(): AppFormat {
  const locale = useLocale();
  const format = useFormatter();
  const t = useTranslations('Common');
  const domainLabel = useDomainLabel();

  return useMemo(
    () => createAppFormat(locale, format, t, domainLabel),
    [domainLabel, format, locale, t],
  );
}
