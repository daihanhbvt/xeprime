import enAuth from '../../messages/en/auth.json';
import enCommon from '../../messages/en/common.json';
import enErrors from '../../messages/en/errors.json';
import enHome from '../../messages/en/home.json';
import viAuth from '../../messages/vi/auth.json';
import viCommon from '../../messages/vi/common.json';
import viErrors from '../../messages/vi/errors.json';
import viHome from '../../messages/vi/home.json';
import { type AppLocale } from './config';

/**
 * Tên file kebab-case ↔ namespace PascalCase, cùng quy ước với `apps/web` để ngày gộp hai bó
 * message vào package chung không phải đổi lời gọi `t()` ở đâu cả.
 *
 * Cả hai ngôn ngữ nạp tĩnh: Metro không tách chunk theo ngôn ngữ như bundler web, và người
 * dùng đổi ngôn ngữ ngay trong app nên bó kia phải có sẵn.
 */
export const MESSAGES = {
  vi: { Common: viCommon, Auth: viAuth, Home: viHome, Errors: viErrors },
  en: { Common: enCommon, Auth: enAuth, Home: enHome, Errors: enErrors },
} as const satisfies Record<AppLocale, unknown>;

/** Tiếng Việt là ngôn ngữ CHUẨN về cấu trúc khoá — tiếng Anh phải khớp đúng hình dạng này. */
export type AppMessages = (typeof MESSAGES)['vi'];
