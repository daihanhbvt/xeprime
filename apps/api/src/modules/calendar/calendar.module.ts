import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { OccupancyService } from './occupancy.service';

@Module({
  controllers: [CalendarController],
  providers: [OccupancyService],
  // BookingsModule/VehiclesModule ghi lịch qua service này, không tự INSERT (ADR 0006).
  exports: [OccupancyService],
})
export class CalendarModule {}
