import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { CustomerDocumentsController } from './customer-documents.controller';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Sổ khách của gian hàng (gap S-01).
 *
 * `CustomersService` export cho `BookingsModule` và `BookingRequestsModule`: gắn khách vào đơn
 * / yêu cầu phải đi qua `resolveWithinTx` — MỘT nơi định nghĩa "SĐT này là khách nào" và một
 * nơi duy nhất quyết định khách bị từ chối phục vụ thì chuyện gì xảy ra.
 */
@Module({
  imports: [AuditModule, StorageModule],
  controllers: [CustomersController, CustomerDocumentsController],
  providers: [CustomersService, CustomerDocumentsService],
  exports: [CustomersService],
})
export class CustomersModule {}
