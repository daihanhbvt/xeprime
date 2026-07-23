import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

/**
 * Quản lý xe của gian hàng (Phase 2): CRUD + list phân trang/filter/sort tenant-scoped.
 *
 * Follow-up có nhãn (chưa làm ở đây): upload ảnh/gallery, giá theo mùa (bảng `vehicle_pricing`),
 * đăng kiểm/bảo hiểm, gửi duyệt public (đi qua ApprovalService — ADR 0008).
 * Khi thêm khoá xe/bảo dưỡng: ghi lịch qua `OccupancyService`, KHÔNG tự INSERT
 * vào `vehicle_occupancies` (ADR 0006).
 */
@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
