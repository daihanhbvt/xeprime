import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { HoldsModule } from '../holds/holds.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { CustomerTripsController } from './customer-trips.controller';
import { CustomerTripsService } from './customer-trips.service';
import { CancellationsModule } from '../cancellations/cancellations.module';
import { PricingModule } from '../pricing/pricing.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { SupportModule } from '../support/support.module';

/**
 * Màn `Chuyến của tôi` phía khách (Wave 11).
 *
 * Module này KHÔNG sở hữu bảng nào. Nó đọc yêu cầu thuê / đơn thuê và mượn `SettlementService`
 * của `BookingsModule` cho phần tiền — chủ đích là để phép tính cọc và phát sinh chỉ tồn tại ở
 * đúng một nơi (Wave 10), còn ở đây chỉ là một phép chiếu hẹp hơn cho khách.
 *
 * `VehiclesModule` vào đây vì cùng một lý do, cho bằng chứng bàn giao: `VehicleContractsService`
 * là lõi DUY NHẤT phát signed URL của kho riêng tư (Wave 4.1) và nó đã khoá sẵn tenant + xe +
 * mục đích + trạng thái file trong chính câu truy vấn. Viết lại một đường phát URL cho khách là
 * viết lại bốn điều kiện đó — và quên một trong bốn.
 */
@Module({
  // CancellationsModule: writer DUY NHẤT của `booking_cancellations` (ADR 0045 điều 1).
  imports: [
    PricingModule,
    BookingsModule,
    HoldsModule,
    VehiclesModule,
    BankAccountsModule,
    CancellationsModule,
    // GCN bảo hiểm đã cấp của chuyến (ADR 0064) — chỉ đọc.
    InsuranceModule,
    // "Chưa nhận được xe" mở case qua `SupportService` — một service cho mọi case (ADR 0066).
    SupportModule,
  ],
  controllers: [CustomerTripsController],
  providers: [CustomerTripsService],
})
export class CustomerTripsModule {}
