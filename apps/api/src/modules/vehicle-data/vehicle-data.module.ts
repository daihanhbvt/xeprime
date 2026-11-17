import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ListingsSyncModule } from '../public-listings/listings-sync.module';
import { PartnerVehicleDataController } from './partner-vehicle-data.controller';
import { PlatformVehicleDataController } from './platform-vehicle-data.controller';
import { PublicVehicleDataController } from './public-vehicle-data.controller';
import { VehicleDataImportService } from './vehicle-data-import.service';
import { VehicleDataQueryService } from './vehicle-data-query.service';
import { VehicleDataSuggestionService } from './vehicle-data-suggestion.service';
import { VehicleDataService } from './vehicle-data.service';

/**
 * Dữ liệu xe chuẩn (ADR 0090) — màn "Dữ liệu xe" của quản trị, gợi ý cho chủ xe, nhập/xuất file.
 * Tách khỏi `CatalogModule` (danh mục BỘ LỌC): dữ liệu xe là thứ khác, có vòng đời duyệt riêng.
 * `VehiclesModule` import module này để tự ghi nhận dữ liệu từ xe của chủ xe khi lưu xe.
 */
@Module({
  // ListingsSync: gộp/dời dữ liệu đổi tên hãng/dòng của xe ⇒ đồng bộ ảnh chụp chợ (ADR 0008).
  imports: [CatalogModule, ListingsSyncModule],
  controllers: [
    PlatformVehicleDataController,
    PartnerVehicleDataController,
    PublicVehicleDataController,
  ],
  providers: [
    VehicleDataService,
    VehicleDataQueryService,
    VehicleDataSuggestionService,
    VehicleDataImportService,
  ],
  // Gợi ý giá trị xe: màn duyệt xe của nền tảng so giá trị khai với cùng con số chủ xe thấy.
  exports: [VehicleDataService, VehicleDataSuggestionService],
})
export class VehicleDataModule {}
