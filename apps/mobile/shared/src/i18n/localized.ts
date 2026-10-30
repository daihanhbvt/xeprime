import { useCallback } from 'react';
import { useLocale } from 'use-intl';
import type { AppLocale } from '@xeprime/types';

/** Locale nhận bản tiếng Anh của một cặp trường dữ liệu `…Vi` / `…En`. */
const ENGLISH_LOCALE: AppLocale = 'en';

/**
 * Chọn bản theo NGÔN NGỮ đang hiển thị cho một cặp trường dữ liệu song ngữ do server trả về
 * (`nameVi`/`nameEn`, `coverageVi`/`coverageEn`… — ADR 0012). Bản native của
 * `apps/web/src/i18n/localized.ts`. Đây là DỮ LIỆU (admin gõ cả hai bản), không phải chuỗi giao diện.
 *
 * KHÔNG tự rơi về bản tiếng Việt khi bản tiếng Anh vắng — nơi gọi quyết định fallback của riêng nó.
 */
export function pickLocalized<T>(locale: string, vi: T, en: T): T {
  return locale === ENGLISH_LOCALE ? en : vi;
}

/** `pickLocalized` gắn sẵn locale của cây React hiện tại. */
export function useLocalizedText() {
  const locale = useLocale();
  return useCallback(<T>(vi: T, en: T): T => pickLocalized(locale, vi, en), [locale]);
}
