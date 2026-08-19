import {
  Body,
  Controller,
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
} from '../../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../../common/types/request-context';
import { SourceContractDownloadDto, SourceContractPresignDto } from '../dto/vehicle-source.dto';
import {
  CompleteMaintenanceDto,
  CorrectMaintenanceCostDto,
  CorrectOdometerDto,
  MaintenanceProfileDto,
  MaintenanceRecordDto,
  MaintenanceRecordListDto,
  OdometerHistoryDto,
  PresignMaintenanceFileDto,
  SaveMaintenanceProfileDto,
  SaveMaintenanceRecordDto,
} from './dto/vehicle-maintenance.dto';
import { MaintenanceService, type MaintenanceViewScope } from './maintenance.service';
import { OdometerService } from './odometer.service';

/**
 * Bảo dưỡng & KM của MỘT xe (Wave 6) — docs/design/12 §9+§10.
 *
 * Bốn mức quyền tách bạch, guard backend là lớp bảo vệ thật:
 *  - `vehicles.maintenance.view`       — KM, chu kỳ, lịch, lịch sử (KHÔNG thấy chi phí/chứng từ)
 *  - `vehicles.maintenance.manage`     — thêm/sửa/hoàn tất/hủy phiếu, cấu hình chu kỳ
 *  - `vehicles.maintenance.view_cost`  — chi phí + mã phiếu chi
 *  - `vehicles.maintenance.view_files` — mở chứng từ riêng tư
 *  - `vehicles.odometer.correct`       — chỉnh tay KM (kèm lý do bắt buộc)
 *  - `vehicles.odometer.decrease`      — GIẢM KM, quyền cao hơn hẳn
 * Không mức nào bao hàm mức khác.
 */
@ApiTags('vehicle-maintenance')
@Controller('vehicles/:id/maintenance')
@TenantScoped()
export class VehicleMaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly odometer: OdometerService,
  ) {}

  @Get('profile')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_VIEW)
  @ApiOperation({ summary: 'KM hiện tại + chu kỳ + mốc bảo dưỡng suy ra' })
  @ApiOkResponse({ type: MaintenanceProfileDto })
  getProfile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
  ): Promise<MaintenanceProfileDto> {
    return this.maintenance.getProfile(tenant.tenantId, vehicleId);
  }

  @Put('profile')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Lưu cấu hình chu kỳ (KM hiện tại sửa ở endpoint riêng có lý do)' })
  @ApiOkResponse({ type: MaintenanceProfileDto })
  saveProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: SaveMaintenanceProfileDto,
  ): Promise<MaintenanceProfileDto> {
    return this.maintenance.saveProfile(tenant.tenantId, vehicleId, user.id, dto);
  }

  @Get('odometer/history')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_VIEW)
  @ApiOperation({ summary: 'Lịch sử KM (chỉ-thêm), mới nhất trước' })
  @ApiOkResponse({ type: OdometerHistoryDto })
  odometerHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<OdometerHistoryDto> {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    return this.odometer.history(tenant.tenantId, vehicleId, parsedPage, parsedLimit);
  }

  /**
   * Chỉnh tay KM. Quyền GIẢM đọc từ scope của request và truyền xuống service — service
   * không tự suy quyền, và thiếu quyền thì số thấp hơn bị từ chối bằng mã riêng.
   */
  @Post('odometer/correction')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_ODOMETER_CORRECT)
  @ApiOperation({ summary: 'Điều chỉnh KM hiện tại (bắt buộc lý do; giảm cần quyền cao hơn)' })
  @ApiOkResponse({ type: MaintenanceProfileDto })
  async correctOdometer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: CorrectOdometerDto,
  ): Promise<MaintenanceProfileDto> {
    await this.odometer.correct(tenant.tenantId, vehicleId, user.id, dto, {
      canDecrease: tenant.permissions.includes(PERMISSION.VEHICLE_ODOMETER_DECREASE),
    });
    return this.maintenance.getProfile(tenant.tenantId, vehicleId);
  }

  @Get('records')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_VIEW)
  @ApiOperation({ summary: 'Lịch sắp tới + lịch sử bảo dưỡng của xe' })
  @ApiOkResponse({ type: MaintenanceRecordListDto })
  async records(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
  ): Promise<MaintenanceRecordListDto> {
    return {
      data: await this.maintenance.listForVehicle(tenant.tenantId, vehicleId, scopeOf(tenant)),
    };
  }

  @Post('records')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Tạo phiếu/lịch bảo dưỡng (có khoảng thời gian → giữ chỗ lịch xe)' })
  @ApiCreatedResponse({ type: MaintenanceRecordDto })
  createRecord(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: SaveMaintenanceRecordDto,
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.createRecord(
      tenant.tenantId,
      vehicleId,
      user.id,
      dto,
      scopeOf(tenant),
    );
  }

  @Put('records/:recordId')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Sửa phiếu bảo dưỡng (optimistic concurrency, đồng bộ lịch xe)' })
  @ApiOkResponse({ type: MaintenanceRecordDto })
  updateRecord(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() dto: SaveMaintenanceRecordDto,
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.updateRecord(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      dto,
      scopeOf(tenant),
    );
  }

  @Post('records/:recordId/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Bắt đầu thực hiện (giữ nguyên chỗ đã đặt trên lịch)' })
  @ApiOkResponse({ type: MaintenanceRecordDto })
  startRecord(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() body: { expectedRowVersion: number },
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.startRecord(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      Number(body.expectedRowVersion),
      scopeOf(tenant),
    );
  }

  @Post('records/:recordId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Hoàn tất: nhả lịch + ghi KM + (thay nhớt) dời mốc — một transaction' })
  @ApiOkResponse({ type: MaintenanceRecordDto })
  completeRecord(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() dto: CompleteMaintenanceDto,
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.completeRecord(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      dto,
      scopeOf(tenant),
    );
  }

  /**
   * Đòi CẢ `manage` lẫn `view_cost`: sửa con số đã nằm trong sổ Thu-Chi là việc của người được
   * phép nhìn tiền, không phải của mọi người quản lý được lịch bảo dưỡng.
   */
  @Patch('records/:recordId/cost')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE, PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW)
  @ApiOperation({ summary: 'Sửa chi phí phiếu ĐÃ hoàn tất — phiếu chi trong sổ đổi theo' })
  @ApiOkResponse({ type: MaintenanceRecordDto })
  correctCost(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() dto: CorrectMaintenanceCostDto,
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.correctCost(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      dto,
      scopeOf(tenant),
    );
  }

  @Post('records/:recordId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Hủy lịch — NHẢ chỗ trên lịch xe trong cùng transaction' })
  @ApiOkResponse({ type: MaintenanceRecordDto })
  cancelRecord(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() body: { expectedRowVersion: number },
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.cancelRecord(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      Number(body.expectedRowVersion),
      scopeOf(tenant),
    );
  }

  @Post('records/:recordId/attachments/presign')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Presign upload chứng từ vào kho riêng tư (Wave 4.1)' })
  @ApiCreatedResponse({ type: SourceContractPresignDto })
  presignAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() dto: PresignMaintenanceFileDto,
  ): Promise<SourceContractPresignDto> {
    return this.maintenance.presignAttachment(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      dto,
    );
  }

  @Post('records/:recordId/attachments')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Xác minh object rồi đính chứng từ vào phiếu' })
  @ApiOkResponse({ type: MaintenanceRecordDto })
  attach(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Body() body: { fileId: string },
  ): Promise<MaintenanceRecordDto> {
    return this.maintenance.attachUploadedFile(
      tenant.tenantId,
      vehicleId,
      user.id,
      recordId,
      body.fileId,
      scopeOf(tenant),
    );
  }

  /** Mở chứng từ là quyền RIÊNG — người quản lý phiếu không đương nhiên đọc được file. */
  @Get('records/:recordId/attachments/:fileId/download')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW)
  @ApiOperation({ summary: 'Phát signed URL ngắn hạn xem/tải một chứng từ' })
  @ApiOkResponse({ type: SourceContractDownloadDto })
  download(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
    @Param('recordId') recordId: string,
    @Param('fileId') fileId: string,
  ): Promise<SourceContractDownloadDto> {
    return this.maintenance.downloadAttachment(tenant.tenantId, vehicleId, recordId, fileId);
  }
}

/** Người gọi thấy được gì — đọc từ scope của request, KHÔNG bao giờ từ body. */
export function scopeOf(tenant: TenantContext): MaintenanceViewScope {
  return {
    canViewCost: tenant.permissions.includes(PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW),
    canViewFiles: tenant.permissions.includes(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW),
  };
}
