import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

/**
 * Quản lý xe của gian hàng (Phase 2): CRUD + list phân trang/filter/sort tenant-scoped.
 *
 * Gửi duyệt public (`submitForPublicReview`) tạo phiếu duyệt để platform xử lý — client KHÔNG
 * tự set `approved_public` (ADR 0008); sửa trường nhạy cảm khi đang công khai tự hạ về chờ duyệt.
 * Follow-up có nhãn (chưa làm ở đây): upload ảnh/gallery, giá theo mùa (bảng `vehicle_pricing`),
 * đăng kiểm/bảo hiểm.
 * Khi thêm khoá xe/bảo dưỡng: ghi lịch qua `OccupancyService`, KHÔNG tự INSERT
 * vào `vehicle_occupancies` (ADR 0006).
 */
@Module({
  imports: [PublicListingsModule, BillingModule, CatalogModule, PricingModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
