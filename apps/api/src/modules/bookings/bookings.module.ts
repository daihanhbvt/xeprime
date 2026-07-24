import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/**
 * Đơn thuê (Phase 4).
 *
 * Ràng buộc (ADR 0006): tạo/sửa/huỷ đơn gọi `OccupancyService` (từ CalendarModule) trong CÙNG
 * transaction; đổi trạng thái qua `canTransitionBooking()`; không tự SELECT check trùng —
 * để exclusion constraint từ chối. AuditService là @Global nên không cần import.
 */
@Module({
  imports: [CalendarModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
