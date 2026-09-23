import { Module } from '@nestjs/common';
import { HostMetricsService } from './host-metrics.service';

/**
 * Module LÁ — chỉ phụ thuộc Prisma.
 *
 * Bốn nơi import nó (marketplace công khai, ví gian hàng, xếp hạng, và test), nên nó không được
 * phép kéo theo bất cứ module nghiệp vụ nào: một phụ thuộc ngược lên `BookingsModule` ở đây sẽ
 * tạo vòng với chính những chỗ cần đọc chỉ số.
 */
@Module({
  providers: [HostMetricsService],
  exports: [HostMetricsService],
})
export class HostMetricsModule {}
