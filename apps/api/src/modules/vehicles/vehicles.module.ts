import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BranchesModule } from '../branches/branches.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { PricingModule } from '../pricing/pricing.module';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { StorageModule } from '../storage/storage.module';
import { MaintenanceBoardController } from './maintenance/maintenance-board.controller';
import { MaintenanceService } from './maintenance/maintenance.service';
import { OdometerService } from './maintenance/odometer.service';
import { VehicleMaintenanceController } from './maintenance/vehicle-maintenance.controller';
import { VehicleDocumentsController } from './documents/vehicle-documents.controller';
import { VehicleDocumentsService } from './documents/vehicle-documents.service';
import {
  OcrNotConfiguredProvider,
  VEHICLE_DOCUMENT_OCR_PROVIDER,
} from './documents/ocr-provider';
import { VehicleAlertsService } from './vehicle-alerts.service';
import { VehicleContractsService } from './vehicle-contracts.service';
import { VehicleSourceService } from './vehicle-source.service';
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
  imports: [
    PublicListingsModule,
    // Xe BẮT BUỘC thuộc một chi nhánh; kiểm tra "chi nhánh này của gian hàng mình và đang chạy"
    // đi qua BranchesService, không lặp lại truy vấn ở đây.
    BranchesModule,
    BillingModule,
    CatalogModule,
    PricingModule,
    StorageModule,
    // Bảo dưỡng ghi lịch xe qua OccupancyService — writer duy nhất của occupancies (ADR 0006).
    CalendarModule,
    // Chi phí bảo dưỡng lên sổ Thu-Chi qua ReceiptsService — writer duy nhất của `receipts`
    // (epic nối tiền). Module này chỉ gọi, không tự INSERT phiếu.
    FinanceModule,
  ],
  controllers: [
    VehiclesController,
    VehicleDocumentsController,
    VehicleMaintenanceController,
    MaintenanceBoardController,
  ],
  providers: [
    VehiclesService,
    VehicleSourceService,
    VehicleContractsService,
    VehicleAlertsService,
    VehicleDocumentsService,
    OdometerService,
    MaintenanceService,
    /**
     * Repo CHƯA có provider OCR nào (không dependency/credential) — mặc định fail rõ ràng:
     * yêu cầu OCR trả 503 OCR_NOT_CONFIGURED, người dùng nhập tay. Có provider thật thì
     * thay `useClass` ở đây, phần điều phối/review không phải đổi.
     */
    { provide: VEHICLE_DOCUMENT_OCR_PROVIDER, useClass: OcrNotConfiguredProvider },
  ],
  /**
   * Bàn giao (Wave 7, ở BookingsModule) tái dùng nguyên ba service này thay vì tự ghi KM /
   * tự tạo phiếu bảo dưỡng / tự dựng luồng file riêng tư — mỗi bảng chỉ có một writer.
   */
  exports: [VehiclesService, OdometerService, MaintenanceService, VehicleContractsService],
})
export class VehiclesModule {}
