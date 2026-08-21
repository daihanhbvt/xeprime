import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import { IdResultDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { SaveVehiclePricingDto, VehiclePricingDto } from '../pricing/dto/pricing.dto';
import {
  PresignSourceContractDto,
  SaveVehicleSourceDto,
  SourceContractDownloadDto,
  SourceContractPresignDto,
  VehicleSourceContractFileDto,
  VehicleSourceDto,
} from './dto/vehicle-source.dto';
import { VehicleAlertsListDto } from './dto/vehicle-alert.dto';
import { VehicleAlertsService, vehicleAlertScopeOf } from './vehicle-alerts.service';
import { VehicleContractsService } from './vehicle-contracts.service';
import { VehicleSourceService } from './vehicle-source.service';
import {
  CreateVehicleDto,
  FleetSummaryDto,
  UpdateVehicleDto,
  Vehicle360SummaryDto,
  VehicleDetailDto,
  VehiclePageDto,
  VehicleListQueryDto,
  VehicleStatsListDto,
  VehicleStatsQueryDto,
} from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

/**
 * Quản lý xe của gian hàng — tất cả tenant-scoped.
 *
 * `tenantId` LUÔN lấy từ `@CurrentTenant` (membership), không nhận từ client (CLAUDE.md mục 5).
 * Mỗi endpoint khai báo permission tương ứng; guard backend là lớp bảo vệ thật, ẩn nút ở FE
 * không bảo vệ gì.
 */
@ApiTags('vehicles')
@Controller('vehicles')
@TenantScoped()
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly source: VehicleSourceService,
    private readonly contracts: VehicleContractsService,
    private readonly alertsService: VehicleAlertsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Danh sách xe của gian hàng (phân trang, filter, sort)' })
  @ApiOkResponse({ type: VehiclePageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleListQueryDto,
  ): Promise<VehiclePageDto> {
    return this.vehicles.list(tenant.tenantId, query) as Promise<VehiclePageDto>;
  }

  /**
   * Chỉ số cho thẻ xe ở `/manage/vehicles`.
   *
   * **Phải khai TRƯỚC `@Get(':id')`** — Nest khớp route theo thứ tự khai báo, đặt sau thì `stats`
   * bị nuốt thành một id và trả 404.
   *
   * Số liệu tài chính chỉ đi kèm khi người gọi có `finance.view`; kiểm ở đây chứ không ở FE,
   * vì ẩn con số trong UI không ngăn được ai đọc thẳng response.
   */
  @Get('stats')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Chỉ số vận hành/tài chính luỹ kế theo xe' })
  @ApiOkResponse({ type: VehicleStatsListDto })
  async stats(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleStatsQueryDto,
  ): Promise<VehicleStatsListDto> {
    const canViewFinance = tenant.permissions.includes(PERMISSION.FINANCE_VIEW);
    return { data: await this.vehicles.stats(tenant.tenantId, query.ids, canViewFinance) };
  }

  /**
   * Việc cần làm theo lô xe (Wave 8) — nguồn DUY NHẤT cho cảnh báo trên thẻ xe.
   *
   * Cùng service với Hồ sơ 360 (`:id/summary`), nên hai bề mặt không bao giờ nói hai điều khác
   * nhau về cùng một xe. Nghĩa vụ tài chính chỉ được tính khi người gọi có `finance.view`.
   * Route tĩnh phải đứng trước `:id` (cùng lý do với `stats`).
   */
  @Get('alerts')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Việc cần làm + KM hiện tại theo lô xe (thẻ xe ở danh sách)' })
  @ApiOkResponse({ type: VehicleAlertsListDto })
  async alerts(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleStatsQueryDto,
  ): Promise<VehicleAlertsListDto> {
    return {
      data: await this.alertsService.forVehicles(
        tenant.tenantId,
        query.ids,
        // Scope theo TỪNG MIỀN (Wave 8.1): endpoint chỉ đòi `vehicles.view`, nên miền nào
        // không có quyền thì không được tính, không được đếm, không được dẫn link.
        vehicleAlertScopeOf(tenant.permissions),
      ),
    };
  }

  /** Cùng lý do thứ tự với `stats`: route tĩnh phải đứng trước `:id`. */
  @Get('fleet-summary')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Đếm đội xe theo trạng thái vận hành (dải chỉ số đầu danh sách)' })
  @ApiOkResponse({ type: FleetSummaryDto })
  fleetSummary(@CurrentTenant() tenant: TenantContext): Promise<FleetSummaryDto> {
    return this.vehicles.fleetSummary(tenant.tenantId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Chi tiết một xe' })
  @ApiOkResponse({ type: VehicleDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.getOne(tenant.tenantId, id);
  }

  /**
   * Tổng hợp cho trang Hồ sơ 360 — một request thay vì FE tự ghép stats + đơn sắp tới + hoạt
   * động. Khối đơn thuê/tài chính gate theo quyền BÊN TRONG service: response chỉ chứa phần
   * người gọi được thấy (cùng nguyên tắc với `stats`).
   */
  @Get(':id/summary')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Tổng hợp Hồ sơ 360 của một xe (chỉ số + đơn thuê theo quyền)' })
  @ApiOkResponse({ type: Vehicle360SummaryDto })
  async summary(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<Vehicle360SummaryDto> {
    const summary = await this.vehicles.summary360(tenant.tenantId, id, {
      canViewFinance: tenant.permissions.includes(PERMISSION.FINANCE_VIEW),
      canViewBookings: tenant.permissions.includes(PERMISSION.BOOKING_VIEW),
    });
    // Cùng service VÀ cùng scope với `GET /vehicles/alerts` — Hồ sơ 360 và thẻ xe không được
    // lệch nhau, kể cả về phần bị che theo quyền.
    const alerts = await this.alertsService.forVehicle(
      tenant.tenantId,
      id,
      vehicleAlertScopeOf(tenant.permissions),
    );
    return { ...summary, ...alerts };
  }

  @Get(':id/pricing')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Giá & chính sách của một xe (nguồn kế thừa/ghi đè + bản gian hàng)' })
  @ApiOkResponse({ type: VehiclePricingDto })
  getPricing(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehiclePricingDto> {
    return this.vehicles.getPricing(tenant.tenantId, id);
  }

  /**
   * `source='shop'` = đặt lại theo gian hàng (xoá bản ghi đè); `source='vehicle'` = lưu ghi đè.
   * Đổi GIÁ của xe đang công khai sẽ hạ về chờ duyệt lại + tạm ẩn listing (ADR 0008) — FE phải
   * xác nhận trước khi gọi; backend cứ thế thực thi, không hỏi lại.
   */
  @Put(':id/pricing')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Lưu giá & chính sách theo xe (ghi đè hoặc đặt lại theo gian hàng)' })
  @ApiOkResponse({ type: VehiclePricingDto })
  savePricing(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVehiclePricingDto,
  ): Promise<VehiclePricingDto> {
    return this.vehicles.savePricing(tenant.tenantId, id, user.id, dto);
  }

  /**
   * Hồ sơ nguồn xe chứa dữ liệu tài chính nhạy cảm (ngân hàng, đối tác, tiền) — đọc đòi
   * `finance.view`, không phải chỉ `vehicle.view`: ẩn tab ở FE không ngăn ai gọi thẳng API.
   */
  @Get(':id/source')
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Hồ sơ nguồn xe & tài chính (Wave 4)' })
  @ApiOkResponse({ type: VehicleSourceDto })
  getSource(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleSourceDto> {
    return this.source.getSource(tenant.tenantId, id);
  }

  /**
   * Replace trọn hồ sơ theo biến thể; đổi hình thức nguồn đồng bộ `vehicles.source_type`
   * trong cùng transaction + audit. FE xác nhận trước khi đổi hình thức; backend cứ thế thực thi.
   */
  @Put(':id/source')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Lưu hồ sơ nguồn xe & tài chính (replace theo hình thức nguồn)' })
  @ApiOkResponse({ type: VehicleSourceDto })
  saveSource(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVehicleSourceDto,
  ): Promise<VehicleSourceDto> {
    return this.source.saveSource(tenant.tenantId, id, user.id, dto);
  }

  /**
   * Hợp đồng nguồn xe là TÀI LIỆU RIÊNG TƯ (Wave 4.1): presign gắn với XE cụ thể — server
   * kiểm xe thuộc tenant rồi mới sinh id + object key (client không tự chọn được chỗ ghi),
   * PUT nhắm vào bucket riêng tư, KHÔNG có publicUrl.
   */
  @Post(':id/source/contracts/presign')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Presign upload hợp đồng nguồn xe vào kho riêng tư' })
  @ApiCreatedResponse({ type: SourceContractPresignDto })
  presignSourceContract(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PresignSourceContractDto,
  ): Promise<SourceContractPresignDto> {
    return this.contracts.presign(tenant.tenantId, id, user.id, dto);
  }

  /** PUT xong chưa phải là xong: server HEAD + soi chữ ký byte đầu rồi mới cho file `ready`. */
  @Post(':id/source/contracts/:fileId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Hoàn tất upload hợp đồng (xác minh object rồi mới cho đính)' })
  @ApiOkResponse({ type: VehicleSourceContractFileDto })
  completeSourceContract(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ): Promise<VehicleSourceContractFileDto> {
    return this.contracts.complete(tenant.tenantId, id, user.id, fileId);
  }

  /**
   * Tải hợp đồng: kiểm quyền + đúng tenant/xe/trạng thái rồi mới phát signed URL sống 120s.
   * `no-store`: URL ký không được nằm lại trong cache trung gian nào.
   */
  @Get(':id/source/contracts/:fileId/download')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Phát signed URL ngắn hạn tải hợp đồng nguồn xe' })
  @ApiOkResponse({ type: SourceContractDownloadDto })
  downloadSourceContract(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ): Promise<SourceContractDownloadDto> {
    return this.contracts.download(tenant.tenantId, id, fileId);
  }

  @Post()
  @RequirePermissions(PERMISSION.VEHICLE_CREATE)
  @ApiOperation({ summary: 'Thêm xe mới (mặc định trạng thái public = nháp)' })
  @ApiCreatedResponse({ type: VehicleDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVehicleDto,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.create(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({
    summary: 'Sửa thông tin xe (sửa trường nhạy cảm khi đang công khai → chờ duyệt lại)',
  })
  @ApiOkResponse({ type: VehicleDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.update(tenant.tenantId, id, user.id, dto);
  }

  @Post(':id/submit-public')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_SUBMIT_PUBLIC)
  @ApiOperation({ summary: 'Gửi xe đi duyệt công khai (đi qua luồng duyệt nền tảng — ADR 0008)' })
  @ApiOkResponse({ type: VehicleDetailDto })
  submitPublic(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.submitForPublicReview(tenant.tenantId, id, user.id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSION.VEHICLE_DELETE)
  @ApiOperation({ summary: 'Xoá mềm xe (chặn nếu còn lịch hiện tại/tương lai)' })
  @ApiOkResponse({ type: IdResultDto })
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ id: string }> {
    return this.vehicles.remove(tenant.tenantId, id);
  }
}
