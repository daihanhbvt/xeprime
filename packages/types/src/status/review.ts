import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái đánh giá (review) — ADR 0005.
 *
 * Nguồn: `xeprime_database_design.md` §17.1. Review tạo ra ở trạng thái `published`; shop hoặc
 * platform có thể ẩn (`hidden`) khi vi phạm. Chỉ review `published` (chưa `deleted_at`) mới
 * tính vào `tenants.rating_avg` / `rating_count`.
 */
export const REVIEW_STATUS = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

export const REVIEW_STATUS_VALUES = Object.values(REVIEW_STATUS) as ReviewStatus[];

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (REVIEW_STATUS_VALUES as string[]).includes(value);
}

/** Khoảng điểm đánh giá hợp lệ (số sao). */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/**
 * Dải sao để vẽ ra: `[1, 2, 3, 4, 5]`.
 *
 * Ở đây chứ không phải trong component vì mỗi client vẽ sao một kiểu — web dùng ký tự `★`, app
 * native dùng icon Ionicons — nhưng SỐ SAO thì phải là một. Viết `[1, 2, 3, 4, 5]` tại chỗ là
 * chép tay một hằng đã có, và bản chép đó không đổi theo khi `RATING_MAX` đổi.
 */
export const RATING_SCALE: readonly number[] = Array.from(
  { length: RATING_MAX - RATING_MIN + 1 },
  (_, index) => RATING_MIN + index,
);

/** Trần độ dài nhận xét — gương `@MaxLength(2000)` của `CreateReviewDto`. */
export const REVIEW_COMMENT_MAX = 2000;

export const REVIEW_STATUS_META: Readonly<Record<ReviewStatus, StatusMeta>> = {
  [REVIEW_STATUS.PUBLISHED]: { label: 'Đang hiển thị', color: STATUS_COLOR.SUCCESS },
  [REVIEW_STATUS.HIDDEN]: { label: 'Đã ẩn', color: STATUS_COLOR.NEUTRAL },
};
