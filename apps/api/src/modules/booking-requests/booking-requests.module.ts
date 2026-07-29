import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module';
import { BookingRequestsController } from './booking-requests.controller';
import { PublicBookingRequestsController } from './public-booking-requests.controller';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Yêu cầu đặt xe từ Marketplace (Phase 4).
 *
 * Duyệt yêu cầu tạo Booking qua `BookingsService.createWithinTx` (từ BookingsModule) trong
 * cùng transaction — giữ chỗ lịch + chống trùng bằng constraint DB (ADR 0006), không nhân đôi
 * logic. AuditService là @Global.
 */
@Module({
  imports: [BookingsModule, PhoneVerificationModule],
  controllers: [BookingRequestsController, PublicBookingRequestsController],
  providers: [BookingRequestsService],
})
export class BookingRequestsModule {}
