import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { LocationsModule } from '../locations/locations.module';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

/**
 * `BranchesService` được export vì hai module khác PHẢI đi qua nó thay vì tự đụng bảng:
 * đăng ký gian hàng (tạo chi nhánh mặc định trong cùng transaction) và module xe (xác nhận
 * chi nhánh gắn được cho xe).
 */
@Module({
  // GeoModule: lưu chi nhánh tự tra toạ độ từ địa chỉ (best-effort) để phí giao xe tận nơi có
  // điểm đi. Thiếu key bản đồ thì chi nhánh vẫn lưu bình thường, chỉ không có toạ độ.
  imports: [LocationsModule, PublicListingsModule, GeoModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
