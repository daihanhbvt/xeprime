import { Module } from '@nestjs/common';
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
  // LocationsModule cấp `AddressService` — nơi DUY NHẤT kiểm danh mục hành chính, ghép chuỗi
  // hiển thị và chốt toạ độ. Chi nhánh không tự gọi bản đồ nữa.
  imports: [LocationsModule, PublicListingsModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
