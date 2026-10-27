import * as yup from 'yup';
import { RATING_MAX, RATING_MIN, REVIEW_COMMENT_MAX } from '@xeprime/types';

/** Câu lỗi đã dịch, do component truyền vào — xem chú thích ở `buildReviewSchema`. */
export interface ReviewSchemaLabels {
  ratingRequired: string;
  ratingRange: string;
  commentTooLong: string;
}

/**
 * Đánh giá chuyến (BKG-16) — chỉ mở khi đơn đã hoàn thành; server chốt điều kiện đó.
 *
 * Schema dựng TẠI CHỖ với câu lỗi đã dịch, không phải một hằng ở mức module: câu lỗi phải đổi
 * theo ngôn ngữ đang chọn, mà chỉ `useTranslations` mới biết ngôn ngữ đó. Đây là cùng khuôn với
 * `buildRefundSchema`, `buildSurchargeSchema`… trong app.
 *
 * Khoảng điểm và trần nhận xét lấy từ `@xeprime/types` — cùng nguồn với schema của web và với
 * `CreateReviewDto`. Gõ tay `1`, `5` hay `1000` ở đây là dựng một luật thứ hai lệch với server.
 */
export function buildReviewSchema(labels: ReviewSchemaLabels) {
  return yup.object({
    rating: yup
      .number()
      .typeError(labels.ratingRequired)
      .required(labels.ratingRequired)
      .integer(labels.ratingRange)
      .min(RATING_MIN, labels.ratingRange)
      .max(RATING_MAX, labels.ratingRange),
    comment: yup.string().trim().max(REVIEW_COMMENT_MAX, labels.commentTooLong).default(''),
  });
}

/** Suy từ CHÍNH schema — `yup.oneOf`/`default` thu hẹp kiểu, interface viết tay sẽ lệch resolver. */
export type ReviewFormValues = yup.InferType<ReturnType<typeof buildReviewSchema>>;
