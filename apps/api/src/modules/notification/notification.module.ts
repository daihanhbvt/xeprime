import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

/**
 * Global: thông báo được phát ra từ nhiều module (bookings, booking-requests, platform-admin,
 * review). Để @Global như AuditModule để nơi phát chỉ cần inject NotificationService, không
 * phải import module khắp nơi.
 */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
