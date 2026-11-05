import { Module } from '@nestjs/common';
import { BookingHistoryController } from './booking-history.controller';
import { BookingHistoryService } from './booking-history.service';

/**
 * Lịch sử "Đơn đã kết thúc" của site partner (05/11/2026). KHÔNG sở hữu bảng nào — chỉ đọc đơn,
 * yêu cầu và dòng trách nhiệm huỷ; mọi lượt GHI vẫn đi qua module chủ của từng bảng.
 */
@Module({
  controllers: [BookingHistoryController],
  providers: [BookingHistoryService],
})
export class BookingHistoryModule {}
