import type { StatusMeta } from './meta';

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

export const REVIEW_STATUS_META: Readonly<Record<ReviewStatus, StatusMeta>> = {
  [REVIEW_STATUS.PUBLISHED]: { label: 'Đang hiển thị', color: 'green' },
  [REVIEW_STATUS.HIDDEN]: { label: 'Đã ẩn', color: 'default' },
};
