import { Module } from '@nestjs/common';
import { CancellationsService } from './cancellations.service';

/**
 * Module LÁ — chỉ Prisma.
 *
 * `BookingsModule` và `BookingRequestsModule` đều import nó, và `BookingRequestsModule` đã import
 * `BookingsModule`. Nếu writer này nằm trong một trong hai thì chiều phụ thuộc còn lại thành một
 * vòng; ở đây thì không có gì để vòng.
 */
@Module({
  providers: [CancellationsService],
  exports: [CancellationsService],
})
export class CancellationsModule {}
