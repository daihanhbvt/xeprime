import { Module } from '@nestjs/common';
import { CancellationsModule } from '../cancellations/cancellations.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CustomersModule } from '../customers/customers.module';
import { DriversModule } from '../drivers/drivers.module';
import { FinanceModule } from '../finance/finance.module';
import { HoldSettlementModule } from '../holds/hold-settlement.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { TaxModule } from '../tax/tax.module';
import { LocationsModule } from '../locations/locations.module';
import { PricingModule } from '../pricing/pricing.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { VehicleSettingsModule } from '../vehicle-settings/vehicle-settings.module';
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
  // `DriversModule` cho gán tài xế vào đơn (17/08) — "gán được" định nghĩa ở DriversService.
  // `CustomersModule` cho sổ khách (S-01) — mọi đơn có SĐT gắn về một hồ sơ khách trong cùng
  // transaction, và khách bị từ chối phục vụ bị chặn ở đúng một chỗ.
  // `FinanceModule` cho quyết toán lên sổ (epic nối tiền): hoàn cọc là tiền THẬT rời tay chủ xe,
  // phải thành phiếu chi trong CÙNG transaction với bản ghi hoàn cọc. `ReceiptsService` vẫn là
  // writer duy nhất của `receipts` — module này chỉ gọi, không tự ghi.
  imports: [
    CalendarModule,
    // Writer DUY NHẤT của `booking_cancellations` (ADR 0045 điều 1) — module LÁ, không vòng.
    CancellationsModule,
    VehiclesModule,
    // Thời gian chết + snapshot điều kiện thuê khi tạo/dời đơn (08/09/2026) — module lá, không vòng.
    VehicleSettingsModule,
    PricingModule,
    DriversModule,
    CustomersModule,
    FinanceModule,
    // `HoldSettlementModule` (R3): chốt kết cục khoản giữ chỗ khi đơn kết thúc — module lá, không vòng.
    HoldSettlementModule,
    // Phase 7: giữ chỗ hợp đồng bảo hiểm lúc tạo đơn, đặt mốc phát hành lúc bàn giao. Module
    // lá (chỉ phụ thuộc Prisma + Audit@Global + một port) nên không tạo vòng.
    InsuranceModule,
    // Địa chỉ đón có cấu trúc (14/09/2026): kiểm danh mục hành chính + ghép chuỗi hiển thị ở
    // MỘT chỗ. LocationsModule là module lá (Prisma + Geo), không tạo vòng.
    LocationsModule,
    // Phase 8: ghi nghĩa vụ thuế khi chuyến bắt đầu. Module lá, không tạo vòng.
    TaxModule,
  ],
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
