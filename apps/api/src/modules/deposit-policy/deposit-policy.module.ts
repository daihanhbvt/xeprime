import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { DepositPolicyService } from './deposit-policy.service';
import { ShopPaymentSettingsController } from './shop-payment-settings.controller';

/**
 * Chính sách thu cọc của gian hàng (Phase 6).
 *
 * Module RIÊNG chứ không nằm trong `HoldsModule` là một quyết định về đồ thị phụ thuộc, không
 * phải về thư mục: `PricingService` cần hỏi chính sách này để báo giá công khai nói cùng con số
 * với lúc duyệt, mà `HoldsModule` lại import `BookingsModule` — cho `PricingModule` phụ thuộc
 * vào đó là kéo theo nửa đồ thị và một vòng chờ sẵn.
 *
 * Ở đây chỉ phụ thuộc `BillingModule` (đọc gói hiện hành) và `AuditService` (@Global).
 */
@Module({
  imports: [BillingModule],
  controllers: [ShopPaymentSettingsController],
  providers: [DepositPolicyService],
  exports: [DepositPolicyService],
})
export class DepositPolicyModule {}
