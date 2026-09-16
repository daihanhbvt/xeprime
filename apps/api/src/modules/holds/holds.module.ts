import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CalendarModule } from '../calendar/calendar.module';
import { BookingHoldsService } from './booking-holds.service';
import { HoldSettlementModule } from './hold-settlement.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { TaxModule } from '../tax/tax.module';
import { VehicleSettingsModule } from '../vehicle-settings/vehicle-settings.module';
import { PlatformMoneyController } from './platform-money.controller';

/**
 * Khoản giữ chỗ (R3). `BookingHoldsService` là writer duy nhất của `booking_holds`; tạo đơn
 * lúc tiền về đi qua `BookingsService.createWithinTx` (writer của `bookings`), chiếm/nhả lịch đi
 * qua `OccupancyService` (writer của `vehicle_occupancies` — ADR 0006).
 *
 * `HoldSettlementModule` tách riêng để `BookingsModule` import được mà không tạo vòng.
 */
@Module({
  // BillingModule: đọc tài khoản nhận tiền cho VietQR của khoản giữ chỗ (chỉ đọc).
  // InsuranceModule (Phase 7): đối soát ba vế cần phần phí bảo hiểm đang giữ hộ — chỉ ĐỌC.
  imports: [
    BillingModule,
    BookingsModule,
    CalendarModule,
    HoldSettlementModule,
    InsuranceModule,
    // Phase 8: phần thuế chưa nộp ở vế `custodied` — chỉ ĐỌC.
    TaxModule,
    VehicleSettingsModule,
  ],
  controllers: [PlatformMoneyController],
  providers: [BookingHoldsService],
  // Re-export MODULE, không phải service: `HoldSettlementService` thuộc `HoldSettlementModule`,
  // và Nest không cho một module export provider mà nó không sở hữu.
  exports: [BookingHoldsService, HoldSettlementModule],
})
export class HoldsModule {}
