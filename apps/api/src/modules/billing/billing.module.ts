import { Module } from '@nestjs/common';
import { ListingsSyncModule } from '../public-listings/listings-sync.module';
import { WalletModule } from '../wallet/wallet.module';
import { BillingService } from './billing.service';
import { PlansController } from './plans.controller';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Gói/hạn (Phase 7, ADR 0010 · cước theo chỗ từ W1/W2 — ADR 0015). Module riêng — không nằm
 * trong platform-admin — vì tenant module (`vehicles`) import BillingService để enforce quota.
 * BillingService là writer DUY NHẤT của `plans` + `tenant_subscriptions` +
 * `subscription_invoices`.
 */
@Module({
  // ListingsSyncModule (R3): gán/huỷ/kích hoạt gói phải đồng bộ chế độ thu phí lên card chợ —
  // ghi qua writer duy nhất của public_listings (ADR 0008, ADR 0024 ràng buộc 2).
  // WalletModule (ADR 0092): phần gói chuyển thừa ghi có ví gian hàng qua writer duy nhất của ví.
  imports: [ListingsSyncModule, WalletModule],
  controllers: [PlansController, SubscriptionsController, SubscriptionController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
