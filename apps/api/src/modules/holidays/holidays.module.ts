import { Module } from '@nestjs/common';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

/**
 * Lịch nghỉ lễ Việt Nam (26/08/2026).
 *
 * Module mỏng có chủ đích: `apps/api` chỉ ĐỌC bảng `public_holidays`. Toàn bộ phần khó — gọi
 * Google, phân trang, diff, chống ghi trùng — nằm ở `apps/worker`, vì đó là việc của ĐỒNG HỒ
 * chứ không của request nào (và vì API key không được rời khỏi một tiến trình nền).
 *
 * `HolidaysService` KHÔNG export: chưa module nào khác có lý do chính đáng để hỏi ngày lễ, và
 * mở sẵn cửa là mời ngày lễ len vào logic giá hoặc logic lịch — đúng thứ ADR 0014 nói là quyết
 * định của gian hàng.
 */
@Module({
  controllers: [HolidaysController],
  providers: [HolidaysService],
})
export class HolidaysModule {}
