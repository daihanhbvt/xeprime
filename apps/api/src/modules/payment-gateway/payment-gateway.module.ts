import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { HoldsModule } from '../holds/holds.module';
import { CustomerPaymentGatewayController } from './customer-payment-gateway.controller';
import { PartnerPaymentGatewayController } from './partner-payment-gateway.controller';
import { PaymentGatewayCallbackController } from './payment-gateway-callback.controller';
import { PaymentGatewayConfig } from './payment-gateway.config';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentGatewaySweeper } from './payment-gateway.sweeper';
import { PlatformPaymentOrdersController } from './platform-payment-orders.controller';
import { PlatformPaymentOrdersService } from './platform-payment-orders.service';
import { MomoAdapter } from './providers/momo.adapter';
import { VnpayAdapter } from './providers/vnpay.adapter';

/**
 * Cổng thanh toán MoMo · VNPAY (ADR 0058 — Proposed). `PaymentGatewayService` là writer DUY NHẤT
 * của `payment_gateway_orders`; hiệu ứng tiền đi qua `BillingService` (hoá đơn gói) và
 * `BookingHoldsService` (tiền giữ chỗ) — đúng hai writer đã nhận tiền SePay, trong transaction của
 * lượt áp. Module này KHÔNG chạm `bank_transactions`.
 */
@Module({
  imports: [BillingModule, HoldsModule],
  controllers: [
    CustomerPaymentGatewayController,
    PartnerPaymentGatewayController,
    PaymentGatewayCallbackController,
    PlatformPaymentOrdersController,
  ],
  providers: [
    PaymentGatewayConfig,
    MomoAdapter,
    VnpayAdapter,
    PaymentGatewayService,
    // Lưới an toàn khi IPN và trang quay về cùng hụt — chỉ chạy khi có cổng đủ khoá.
    PaymentGatewaySweeper,
    PlatformPaymentOrdersService,
  ],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
