import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { PricingModule } from '../pricing/pricing.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingHandoversController } from './handovers/booking-handovers.controller';
import { HandoverQueueController } from './handovers/handover-queue.controller';
import { HandoversService } from './handovers/handovers.service';
import { BookingSettlementController } from './settlement/booking-settlement.controller';
import { SettlementService } from './settlement/settlement.service';

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
  // `PricingModule` cho gợi ý phí quá giờ (Wave 10) — đọc chính sách hiệu lực, không ghi.
  imports: [CalendarModule, VehiclesModule, PricingModule],
  controllers: [
    BookingsController,
    BookingHandoversController,
    HandoverQueueController,
    BookingSettlementController,
  ],
  providers: [BookingsService, HandoversService, SettlementService],
  /**
   * `HandoversService` xuất ra để Trung tâm bảo dưỡng đếm được việc `Thiếu KM trả` — hàng đợi
   * đó sống ở bề mặt việc-cần-làm đã có, không phải một module điều hướng thứ hai (Wave 8).
   *
   * `SettlementService` xuất ra cho màn chuyến của KHÁCH (Wave 11): khách và chủ xe phải nhìn
   * cùng một phép tính cọc/phát sinh. Dựng lại công thức ở module khách là cách chắc chắn nhất
   * để hai bên đọc ra hai số tiền khác nhau.
   */
  exports: [BookingsService, HandoversService, SettlementService],
})
export class BookingsModule {}
