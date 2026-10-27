import { apiPatch, apiPost } from '@/services/api-client';
import type { CreateReviewInput, OwnReview, UpdateReviewInput } from './types';

/**
 * Danh sách chuyến KHÔNG còn ở đây: `features/trips` là bề mặt duy nhất (Wave 11), vì nó mang
 * cả tiền, cọc và hoàn cọc. Feature này chỉ còn đúng việc tạo đánh giá.
 */
export const createReview = (body: CreateReviewInput): Promise<{ id: string }> =>
  apiPost<{ id: string }>('/reviews', body);

/** Sửa đánh giá của chính mình — server chỉ cho MỘT lần (`REVIEW_EDIT_LIMIT`). */
export const updateReview = ({ id, ...body }: UpdateReviewInput & { id: string }): Promise<OwnReview> =>
  apiPatch<OwnReview>(`/reviews/${encodeURIComponent(id)}`, body);
