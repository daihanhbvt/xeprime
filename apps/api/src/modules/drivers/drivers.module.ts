import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { DriverSelfController } from './driver-self.controller';
import { DriverSelfService } from './driver-self.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

/**
 * Tài xế liên kết (ADR 0063). `DriversService` export cho bookings / booking-requests /
 * vehicle-settings: mọi lượt gán, gỡ, báo tài xế đi qua MỘT writer.
 */
@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [DriversController, DriverSelfController],
  providers: [DriversService, DriverSelfService],
  exports: [DriversService],
})
export class DriversModule {}
