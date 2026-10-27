import { BOOKING_STATUS, REVIEW_STATUS } from '@xeprime/types';

/**
 * Khách còn lượt CHỈNH SỬA đánh giá không — một nguồn cho cả cờ `canEdit` trên DTO chuyến và
 * điều kiện của `ReviewService.updateOwn` (cổng thật vẫn là `updateMany … editedAt: null` ở DB).
 * Chuyến hoàn thành, đánh giá đang `published`, và chưa từng sửa (chỉ được sửa MỘT lần).
 */
export function canEditReview(
  bookingStatus: string,
  review: { status: string; editedAt: Date | null },
): boolean {
  return (
    bookingStatus === BOOKING_STATUS.COMPLETED &&
    review.status === REVIEW_STATUS.PUBLISHED &&
    review.editedAt === null
  );
}
