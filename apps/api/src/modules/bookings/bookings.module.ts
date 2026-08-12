import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingHandoversController } from './handovers/booking-handovers.controller';
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
  controllers: [BookingsController, BookingHandoversController],
  providers: [BookingsService, HandoversService],
  // Xuất để BookingRequestsModule dùng `createWithinTx` khi duyệt yêu cầu đặt xe.
  exports: [BookingsService],
})
export class BookingsModule {}
