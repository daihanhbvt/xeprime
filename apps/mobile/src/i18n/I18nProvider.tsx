import { useCallback, useEffect, type ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { localeChanged } from '@/i18n/locale.slice';
import { APP_TIME_ZONE, isAppLocale, type AppLocale } from './config';
import { MESSAGES } from './messages';

export function I18nProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const locale = useAppSelector((state) => state.locale.current);

  useEffect(() => {
    let cancelled = false;

    void getSecureItem(SECURE_KEY.LOCALE).then((saved) => {
      if (!cancelled && isAppLocale(saved)) dispatch(localeChanged(saved));
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone={APP_TIME_ZONE}>
      {children}
    </IntlProvider>
  );
}

export function useAppLocale(): {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
} {
  const dispatch = useAppDispatch();
  const locale = useAppSelector((state) => state.locale.current);

  const setLocale = useCallback(
    (next: AppLocale) => {
      dispatch(localeChanged(next));
      // Ghi bền chạy nền: giao diện đã đổi rồi, lỗi ghi chỉ khiến lần mở app sau quay về
      // ngôn ngữ máy — không đáng chặn thao tác của người dùng.
      void setSecureItem(SECURE_KEY.LOCALE, next);
    },
    [dispatch],
  );

  return { locale, setLocale };
}
