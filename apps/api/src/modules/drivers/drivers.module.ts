import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

/**
 * `DriversService` export cho module bookings: gán tài xế vào đơn phải đi qua
 * `findAssignable` — một nơi định nghĩa "tài xế gán được" (cùng tenant, active, chưa xoá).
 */
@Module({
  imports: [AuditModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
