import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { HoldSettlementModule } from '../holds/hold-settlement.module';
import { SupportModule } from '../support/support.module';
import { PlatformTripVerdictController } from './platform-trip-verdict.controller';
import { TripVerdictService } from './trip-verdict.service';

/**
 * Kết luận chuyến của nền tảng (ADR 0094) — module riêng vì nó nối HAI module không biết nhau:
 * hỗ trợ (kết luận case) và đơn thuê (biên bản bàn giao, chuyển trạng thái). Đặt vào một trong hai
 * là bắt module đó import module kia chỉ cho một endpoint.
 */
@Module({
  imports: [BookingsModule, HoldSettlementModule, SupportModule],
  controllers: [PlatformTripVerdictController],
  providers: [TripVerdictService],
})
export class TripVerdictModule {}
