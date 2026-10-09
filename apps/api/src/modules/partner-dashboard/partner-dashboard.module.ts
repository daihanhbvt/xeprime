import { Module } from '@nestjs/common';
import { HostMetricsModule } from '../host-metrics/host-metrics.module';
import { PartnerDashboardController } from './partner-dashboard.controller';
import { PartnerDashboardService } from './partner-dashboard.service';

/**
 * Tổng quan site partner. Chỉ ĐỌC — không ghi bảng nào, nên không phụ thuộc module nghiệp vụ nào
 * ngoài nguồn uy tín; các câu nghiệp vụ dùng lại (`presetWhere`, `completedTripsInPeriodWhere`) là
 * hàm thuần, import thẳng chứ không qua DI.
 */
@Module({
  imports: [HostMetricsModule],
  controllers: [PartnerDashboardController],
  providers: [PartnerDashboardService],
})
export class PartnerDashboardModule {}
