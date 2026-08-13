import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingHandoversController } from './handovers/booking-handovers.controller';
import { HandoverQueueController } from './handovers/handover-queue.controller';
import { HandoversService } from './handovers/handovers.service';

/**
 * Đơn thuê (Phase 4) + bàn giao xe (Wave 7).
 *
 * Ràng buộc (ADR 0006): tạo/sửa/huỷ đơn gọi `OccupancyService` (từ CalendarModule) trong CÙNG
 * transaction; đổi trạng thái qua `canTransitionBooking()`; không tự SELECT check trùng —
 * để exclusion constraint từ chối. AuditService là @Global nên không cần import.
 *
 * Bàn giao ở ĐÂY chứ không phải module riêng: nó là một bước của vòng đời đơn thuê, dùng
 * chính route `/bookings/:id/...`. Nó mượn `OdometerService`/`MaintenanceService`/
 * `VehicleContractsService` từ VehiclesModule — mỗi bảng vẫn chỉ có một writer.
 */
@Module({
  imports: [CalendarModule, VehiclesModule],
  controllers: [BookingsController, BookingHandoversController, HandoverQueueController],
  providers: [BookingsService, HandoversService],
  /**
   * `HandoversService` xuất ra để Trung tâm bảo dưỡng đếm được việc `Thiếu KM trả` — hàng đợi
   * đó sống ở bề mặt việc-cần-làm đã có, không phải một module điều hướng thứ hai (Wave 8).
   */
  exports: [BookingsService, HandoversService],
})
export class BookingsModule {}
