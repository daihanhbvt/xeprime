import { Module } from '@nestjs/common';
import { OccupancyService } from '../calendar/occupancy.service';
import { VehicleSettingsController } from './vehicle-settings.controller';
import { VehicleSettingsService } from './vehicle-settings.service';
import { VehicleTripHistoryService } from './vehicle-trip-history.service';

/**
 * Thiết lập vận hành theo xe (08/09/2026) — module LÁ, cố ý không import VehiclesModule /
 * BookingsModule / PricingModule: Bookings, Holds, BookingRequests, Pricing và PublicListings đều
 * cần hỏi nó (thời gian chết, khung giờ, tự động nhận, snapshot điều kiện), nên nó phải đứng
 * dưới tất cả để không tạo vòng.
 *
 * `OccupancyService` được KHAI TRỰC TIẾP làm provider thay vì import `CalendarModule`: CalendarModule
 * → PricingModule → VehicleSettingsModule → CalendarModule là một vòng file-import làm Nest nhận
 * `undefined` ở mảng imports. Service đó không có trạng thái và chỉ cần PrismaService (global), nên
 * một instance thứ hai để ĐỌC lịch bận cho preview là vô hại; mọi GHI lịch vẫn đi qua CalendarModule.
 */
@Module({
  controllers: [VehicleSettingsController],
  providers: [VehicleSettingsService, VehicleTripHistoryService, OccupancyService],
  exports: [VehicleSettingsService],
})
export class VehicleSettingsModule {}
