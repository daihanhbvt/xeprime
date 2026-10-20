import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogModelService } from './catalog-model.service';
import { CatalogService } from './catalog.service';
import { PlatformCatalogController } from './platform-catalog.controller';
import { StorageModule } from '../storage/storage.module';

/**
 * Danh mục lọc dùng chung. Module riêng — không nằm trong `platform-admin` — vì `VehiclesModule`
 * import `CatalogService` để chặn xe lưu giá trị ngoài danh mục, và endpoint đọc là công khai
 * cho marketplace.
 */
@Module({
  // R2 cho ảnh danh mục (icon, ảnh lớn trang chủ) — presign ở `PlatformCatalogController`.
  imports: [StorageModule],
  controllers: [CatalogController, PlatformCatalogController],
  providers: [CatalogService, CatalogModelService],
  exports: [CatalogService, CatalogModelService],
})
export class CatalogModule {}
