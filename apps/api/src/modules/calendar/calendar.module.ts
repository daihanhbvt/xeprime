import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { BulkDayController } from './bulk-day.controller';
import { BulkDayService } from './bulk-day.service';
import { CalendarController } from './calendar.controller';
import { OccupancyService } from './occupancy.service';
import { VehicleBlocksController } from './vehicle-blocks.controller';
import { VehicleBlocksService } from './vehicle-blocks.service';

@Module({
  // PricingModule: báo giá nội bộ `/calendar/quote` cho luồng Đặt xe trên lịch (chỉ ĐỌC giá).
  imports: [PricingModule],
  controllers: [CalendarController, VehicleBlocksController, BulkDayController],
  // VehicleBlocksService: khoá xe thủ công — block + occupancy cùng transaction (ADR 0006).
  // BulkDayService: khoá / đặt giá cả đội xe cho một khoảng ngày, mở từ thẻ ngày trên lịch.
  providers: [OccupancyService, VehicleBlocksService, BulkDayService],
  // BookingsModule/VehiclesModule ghi lịch qua service này, không tự INSERT (ADR 0006).
  exports: [OccupancyService],
})
export class CalendarModule {}
