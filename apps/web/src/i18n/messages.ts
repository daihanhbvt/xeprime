import type { AppLocale } from './config';

/**
 * Kiểu của bó message, lấy từ TIẾNG VIỆT — ngôn ngữ chuẩn về cấu trúc khoá.
 * `global.d.ts` gắn nó vào next-intl để `t('...')` được kiểm tra lúc typecheck: gõ sai một
 * khoá là lỗi biên dịch, không phải một chuỗi `Common.actions.svae` lọt ra production.
 */
export type AppMessages = typeof import('../../messages/vi').default;

/**
 * MỘT hàm nạp cho MỘT ngôn ngữ.
 *
 * Hai lối import tĩnh riêng biệt (không phải `import(\`../../messages/${locale}\`)`) để bundler
 * tách được hai chunk độc lập và chỉ chunk của ngôn ngữ đang dùng được đọc. Đường dẫn ghép
 * chuỗi sẽ sinh context module ôm cả hai ngôn ngữ.
 */
const BUNDLES: Readonly<Record<AppLocale, () => Promise<{ default: AppMessages }>>> = {
  vi: () => import('../../messages/vi'),
  en: () => import('../../messages/en'),
};

/** Nạp message của ĐÚNG một ngôn ngữ. Chỉ gọi ở phía server (`i18n/request.ts`). */
export async function loadMessages(locale: AppLocale): Promise<AppMessages> {
  const bundle = await BUNDLES[locale]();
  return bundle.default;
}
