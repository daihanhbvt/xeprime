import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeePoliciesModule } from '../fee-policies/fee-policies.module';
import { NotificationModule } from '../notification/notification.module';
import { DriverSelfController } from './driver-self.controller';
import { DriverSelfService } from './driver-self.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { InternalDriversController } from './internal-drivers.controller';
import { InternalDriversService } from './internal-drivers.service';

/**
 * Tài xế liên kết (ADR 0063) + danh bạ tài xế nội bộ (ADR 0108). `DriversService` export cho bookings / booking-requests /
 * vehicle-settings: mọi lượt gán, gỡ, báo tài xế đi qua MỘT writer.
 */
@Module({
  imports: [AuditModule, NotificationModule, FeePoliciesModule],
  controllers: [DriversController, DriverSelfController, InternalDriversController],
  providers: [DriversService, DriverSelfService, InternalDriversService],
  exports: [DriversService, InternalDriversService],
})
export class DriversModule {}
