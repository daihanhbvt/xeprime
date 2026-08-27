import { apiPost } from '@/services/api-client';
import type { CreateReviewInput } from './types';

/**
 * Danh sách chuyến KHÔNG còn ở đây: `features/trips` là bề mặt duy nhất (Wave 11), vì nó mang
 * cả tiền, cọc và hoàn cọc. Feature này chỉ còn đúng việc tạo đánh giá.
 */
export const createReview = (body: CreateReviewInput): Promise<{ id: string }> =>
  apiPost<{ id: string }>('/reviews', body);
