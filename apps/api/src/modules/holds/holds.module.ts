import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CalendarModule } from '../calendar/calendar.module';
import { BookingHoldsService } from './booking-holds.service';
import { HoldSettlementModule } from './hold-settlement.module';
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
  imports: [BillingModule, BookingsModule, CalendarModule, HoldSettlementModule],
  controllers: [PlatformMoneyController],
  providers: [BookingHoldsService],
  // Re-export MODULE, không phải service: `HoldSettlementService` thuộc `HoldSettlementModule`,
  // và Nest không cho một module export provider mà nó không sở hữu.
  exports: [BookingHoldsService, HoldSettlementModule],
})
export class HoldsModule {}
