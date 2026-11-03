import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CalendarModule } from '../calendar/calendar.module';
import { PricingModule } from '../pricing/pricing.module';
import { TaxModule } from '../tax/tax.module';
import { WalletModule } from '../wallet/wallet.module';
import { BookingExtensionsController } from './booking-extensions.controller';
import { BookingExtensionsService } from './booking-extensions.service';

/**
 * Phụ lục gia hạn đơn dài hạn (ADR 0077). Module LÁ với `BookingsModule`: không import nó, để
 * `BookingsService` gọi được `onBookingClosedWithinTx` mà không có vòng phụ thuộc. Mọi bảng có
 * writer riêng vẫn đi qua writer đó — lịch (`OccupancyService`), sổ ví (`WalletService`), thuế
 * (`TaxService`); `BillingService` chỉ để đọc tài khoản nhận tiền.
 */
@Module({
  imports: [BillingModule, CalendarModule, PricingModule, TaxModule, WalletModule],
  controllers: [BookingExtensionsController],
  providers: [BookingExtensionsService],
  exports: [BookingExtensionsService],
})
export class BookingExtensionsModule {}
