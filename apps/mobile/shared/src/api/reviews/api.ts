import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

export type CreateReviewInput = components['schemas']['CreateReviewDto'];
export type UpdateReviewInput = components['schemas']['UpdateReviewDto'];
export type OwnReview = components['schemas']['OwnReviewDto'];

/**
 * Chỉ còn đúng việc TẠO đánh giá: danh sách chuyến là bề mặt của `trips` (nó mang cả tiền, cọc
 * và hoàn cọc), còn đánh giá đã đăng thì đọc qua marketplace của trang xe.
 *
 * Đánh giá lần hai trả 409 — nơi gọi hiện đánh giá cũ, không hiện lỗi đỏ.
 */
export const reviewsApi = {
  create(body: CreateReviewInput): Promise<{ id: string }> {
    return getApiClient().post<{ id: string }>('/reviews', body);
  },
  /** Sửa đánh giá của chính mình — server chỉ cho MỘT lần (409 `REVIEW_EDIT_LIMIT`). */
  update(id: string, body: UpdateReviewInput): Promise<OwnReview> {
    return getApiClient().patch<OwnReview>(`/reviews/${encodeURIComponent(id)}`, body);
  },
};
