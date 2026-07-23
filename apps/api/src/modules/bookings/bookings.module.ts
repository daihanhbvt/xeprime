import { Module } from '@nestjs/common';

/**
 * Skeleton — Phase 4 implement đơn thuê và chuyển trạng thái.
 *
 * Ràng buộc khi implement:
 *  - Đổi trạng thái phải qua `canTransitionBooking()` của @xeprime/types.
 *  - Tạo/sửa/huỷ đơn phải gọi `OccupancyService` trong cùng transaction (ADR 0006).
 *  - Không tự kiểm tra trùng lịch bằng SELECT: để exclusion constraint từ chối.
 */
@Module({})
export class BookingsModule {}
