import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogModelService } from './catalog-model.service';
import { CatalogService } from './catalog.service';
import { PlatformCatalogController } from './platform-catalog.controller';

/**
 * Danh mục lọc dùng chung. Module riêng — không nằm trong `platform-admin` — vì `VehiclesModule`
 * import `CatalogService` để chặn xe lưu giá trị ngoài danh mục, và endpoint đọc là công khai
 * cho marketplace.
 */
@Module({
  controllers: [CatalogController, PlatformCatalogController],
  providers: [CatalogService, CatalogModelService],
  exports: [CatalogService, CatalogModelService],
})
export class CatalogModule {}
