import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { CustomerTripsController } from './customer-trips.controller';
import { CustomerTripsService } from './customer-trips.service';

/**
 * Màn `Chuyến của tôi` phía khách (Wave 11).
 *
 * Module này KHÔNG sở hữu bảng nào. Nó đọc yêu cầu thuê / đơn thuê và mượn `SettlementService`
 * của `BookingsModule` cho phần tiền — chủ đích là để phép tính cọc và phát sinh chỉ tồn tại ở
 * đúng một nơi (Wave 10), còn ở đây chỉ là một phép chiếu hẹp hơn cho khách.
 */
@Module({
  imports: [BookingsModule],
  controllers: [CustomerTripsController],
  providers: [CustomerTripsService],
})
export class CustomerTripsModule {}
