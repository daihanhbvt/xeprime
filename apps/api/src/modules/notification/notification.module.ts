import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PushDeviceService } from './push-device.service';

/**
 * Global: thông báo được phát ra từ nhiều module (bookings, booking-requests, chat,
 * platform-admin, review). Để @Global như AuditModule để nơi phát chỉ cần inject
 * NotificationService, không phải import module khắp nơi.
 *
 * Việc TẮT thiết bị khi thu hồi phiên KHÔNG đi qua service này mà nằm thẳng trong
 * `NativeSessionService.revokeSession`: nó phải là một câu trong cùng `$transaction([…])` với
 * việc thu hồi phiên, và bắc một phụ thuộc auth → notification chỉ để có thêm một `updateMany`
 * là đổi một dòng SQL lấy một vòng phụ thuộc giữa hai module.
 */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, PushDeviceService],
  exports: [NotificationService],
})
export class NotificationModule {}
