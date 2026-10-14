import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { FeePoliciesModule } from '../fee-policies/fee-policies.module';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { EmailOutboxDispatcher } from './email-outbox.dispatcher';
import { PlanGuideTemplatesService } from './plan-guide-templates.service';
import { PlatformAppConfigController } from './platform-app-config.controller';
import { PlatformPlanGuideTemplatesController } from './platform-plan-guide-templates.controller';

/**
 * Cấu hình app bật/tắt từ xa (`isPlanPromotionEnabled`) + hàng đợi email hướng dẫn gói và mẫu do
 * admin quản lý (docs/app-config.md).
 */
@Module({
  imports: [BillingModule, FeePoliciesModule],
  controllers: [AppConfigController, PlatformAppConfigController, PlatformPlanGuideTemplatesController],
  providers: [AppConfigService, PlanGuideTemplatesService, EmailOutboxDispatcher],
  exports: [AppConfigService],
})
export class AppConfigModule {}
