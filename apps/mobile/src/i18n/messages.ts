import enAuth from '@xeprime/domain/messages/en/auth.json';
import enCommon from '@xeprime/domain/messages/en/common.json';
import enErrors from '@xeprime/domain/messages/en/errors.json';
import enMobileShell from '@xeprime/domain/messages/en/mobile-shell.json';
import viAuth from '@xeprime/domain/messages/vi/auth.json';
import viCommon from '@xeprime/domain/messages/vi/common.json';
import viErrors from '@xeprime/domain/messages/vi/errors.json';
import viMobileShell from '@xeprime/domain/messages/vi/mobile-shell.json';
import { type AppLocale } from './config';

/**
 * Bảng gom message của app native.
 *
 * **Gốc là `@xeprime/domain/messages`, dùng CHUNG với `apps/web`** (quyết định 24/08/2026):
 * một khoá chỉ có một bản dịch, nên hai client không bao giờ nói khác nhau về cùng một thứ.
 * File này KHÔNG chứa chữ — nó chỉ chọn namespace nào được nạp vào bundle.
 *
 * Danh sách là TẬP CON có chủ đích: Metro không tách chunk theo màn hình, nên mọi namespace
 * kể ra đây nằm trong app kể cả khi chưa màn nào dùng. Thêm namespace ĐÚNG LÚC mở tính năng
 * tương ứng — mở màn booking thì thêm `bookings`/`booking-requests` của gốc chung, KHÔNG viết
 * lại chuỗi vào `mobile-shell` (namespace chia theo tính năng, không theo client).
 *
 * `pnpm --filter @xeprime/web i18n:check` canh file này: gom namespace không có ở gốc, hay hai
 * ngôn ngữ gom lệch nhau, là fail ở cổng chứ không phải lúc bundle chạy.
 *
 * Cả hai ngôn ngữ nạp tĩnh: người dùng đổi ngôn ngữ ngay trong app nên bó kia phải có sẵn.
 */
export const MESSAGES = {
  vi: { Common: viCommon, Auth: viAuth, Errors: viErrors, MobileShell: viMobileShell },
  en: { Common: enCommon, Auth: enAuth, Errors: enErrors, MobileShell: enMobileShell },
} as const satisfies Record<AppLocale, unknown>;

/** Tiếng Việt là ngôn ngữ CHUẨN về cấu trúc khoá — tiếng Anh phải khớp đúng hình dạng này. */
export type AppMessages = (typeof MESSAGES)['vi'];
