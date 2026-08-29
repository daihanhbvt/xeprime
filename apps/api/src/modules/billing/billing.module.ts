import { Module } from '@nestjs/common';
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
  controllers: [PlansController, SubscriptionsController, SubscriptionController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
