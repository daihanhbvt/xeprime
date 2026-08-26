/**
 * Ngày lễ Việt Nam (26/08/2026) — dữ liệu TOÀN NỀN TẢNG, chỉ để HIỂN THỊ trên lịch điều phối.
 *
 * Ranh giới quan trọng nhất của tính năng này nằm ở chỗ nó KHÔNG làm: ngày lễ không khoá xe,
 * không đổi giá, không chặn đặt xe, không sinh `vehicle_occupancies`. Nó là một lớp thông tin
 * chồng lên lưới lịch để người trực biết "hôm đó cả nước nghỉ" — quyết định cho thuê hay không,
 * giá bao nhiêu, vẫn hoàn toàn là của gian hàng (ADR 0014).
 *
 * Vì sao là hằng số ở `@xeprime/types` chứ không phải chuỗi trần: worker ghi giá trị này xuống
 * DB, API đọc lên, web tra nhãn — ba nơi, và ADR 0005 nói mã status/enum chỉ được có MỘT nguồn.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Phân loại một ngày trong lịch lễ.
 *
 * Google không trả về mã phân loại — nó trả một câu MÔ TẢ bằng ngôn ngữ của lịch ("Ngày lễ công
 * cộng", "Public holiday", "Observance"…). Việc quy câu đó về một trong bốn mã dưới đây là của
 * `classifyHolidayEventType` ở `@xeprime/domain`, và mặc định là `OTHER` chứ không phải
 * `PUBLIC_HOLIDAY`: đoán nhầm một ngày kỷ niệm thành ngày nghỉ chính thức là nói sai với người
 * đang xếp lịch giao xe.
 */
export const HOLIDAY_EVENT_TYPE = {
  /** Nghỉ chính thức theo quy định (Tết, 30/4, 1/5, 2/9…). */
  PUBLIC_HOLIDAY: 'public_holiday',
  /** Ngày kỷ niệm/lễ có tên nhưng KHÔNG được nghỉ (8/3, 20/10, Valentine…). */
  OBSERVANCE: 'observance',
  /** Mốc mùa vụ trong lịch (lập xuân, đông chí…). */
  SEASON: 'season',
  /** Không quy được về ba loại trên — hiển thị nguyên tên, không suy diễn thêm. */
  OTHER: 'other',
} as const;

export type HolidayEventType = (typeof HOLIDAY_EVENT_TYPE)[keyof typeof HOLIDAY_EVENT_TYPE];
export const HOLIDAY_EVENT_TYPE_VALUES = Object.values(HOLIDAY_EVENT_TYPE) as HolidayEventType[];

export const HOLIDAY_EVENT_TYPE_META: Readonly<Record<HolidayEventType, StatusMeta>> = {
  [HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY]: { label: 'Nghỉ lễ chính thức', color: STATUS_COLOR.DANGER },
  [HOLIDAY_EVENT_TYPE.OBSERVANCE]: { label: 'Ngày kỷ niệm', color: STATUS_COLOR.WAITING },
  [HOLIDAY_EVENT_TYPE.SEASON]: { label: 'Tiết trong năm', color: STATUS_COLOR.NEUTRAL },
  [HOLIDAY_EVENT_TYPE.OTHER]: { label: 'Ngày đặc biệt', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Bản ghi này từ đâu ra.
 *
 * Tách nguồn ra khỏi dữ liệu vì đồng bộ là một thao tác XOÁ ĐƯỢC: mọi dòng `google_calendar`
 * nằm trong cửa sổ đồng bộ mà lần fetch mới không thấy nữa đều bị xoá. Dòng `manual` (nếu sau
 * này có ai thêm tay) phải sống sót qua mọi lần đồng bộ — nếu không, một ngày nghỉ bù do doanh
 * nghiệp tự khai sẽ biến mất sau 06:00 sáng hôm sau mà không ai hiểu vì sao.
 */
export const HOLIDAY_SOURCE = {
  GOOGLE_CALENDAR: 'google_calendar',
  MANUAL: 'manual',
} as const;

export type HolidaySource = (typeof HOLIDAY_SOURCE)[keyof typeof HOLIDAY_SOURCE];
export const HOLIDAY_SOURCE_VALUES = Object.values(HOLIDAY_SOURCE) as HolidaySource[];

export const HOLIDAY_SOURCE_LABEL: Readonly<Record<HolidaySource, string>> = {
  [HOLIDAY_SOURCE.GOOGLE_CALENDAR]: 'Lịch Google',
  [HOLIDAY_SOURCE.MANUAL]: 'Nhập tay',
};

/** Trạng thái một lượt đồng bộ (`holiday_sync_runs.status`). */
export const HOLIDAY_SYNC_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;

export type HolidaySyncStatus = (typeof HOLIDAY_SYNC_STATUS)[keyof typeof HOLIDAY_SYNC_STATUS];
export const HOLIDAY_SYNC_STATUS_VALUES = Object.values(
  HOLIDAY_SYNC_STATUS,
) as HolidaySyncStatus[];

/**
 * Ai châm ngòi lượt đồng bộ.
 *
 * `scheduled` = vòng lặp worker tự chạy theo đồng hồ; `manual` = người vận hành gõ
 * `pnpm --filter @xeprime/worker holidays:sync`. Phân biệt để khi đọc `holiday_sync_runs` còn
 * biết một lượt `failed` là sự cố nền hay là lần ai đó đang thử cấu hình key.
 */
export const HOLIDAY_SYNC_TRIGGER = {
  SCHEDULED: 'scheduled',
  MANUAL: 'manual',
} as const;

export type HolidaySyncTrigger = (typeof HOLIDAY_SYNC_TRIGGER)[keyof typeof HOLIDAY_SYNC_TRIGGER];
export const HOLIDAY_SYNC_TRIGGER_VALUES = Object.values(
  HOLIDAY_SYNC_TRIGGER,
) as HolidaySyncTrigger[];

/**
 * Lịch nghỉ lễ Việt Nam công khai của Google — giá trị MẶC ĐỊNH khi chưa cấu hình
 * `GOOGLE_HOLIDAY_CALENDAR_ID`.
 *
 * Nằm ở đây thay vì gõ hai lần: `apps/api/src/config/env.schema.ts` và
 * `apps/worker/src/lib/env.ts` cùng cần nó, và hai bản sao lệch nhau nghĩa là API mô tả một
 * lịch còn worker đồng bộ một lịch khác. Cùng lý do với `SESSION_COOKIE_NAME_DEFAULT`.
 *
 * Đây là MẶC ĐỊNH, không phải giá trị cứng: logic luôn đọc từ env (ADR — cấu hình vận hành
 * không nằm trong mã).
 */
export const GOOGLE_HOLIDAY_CALENDAR_ID_DEFAULT = 'vi.vietnamese#holiday@group.v.calendar.google.com';
