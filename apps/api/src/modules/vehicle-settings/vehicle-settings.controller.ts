import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  DriverSurchargeRulesDto,
  PatchVehicleServiceSettingDto,
  SaveDriverSurchargeRulesDto,
  SaveVehicleOperationSettingsDto,
  VehicleOperationSettingsDto,
  VehicleServiceSettingDto,
  VehicleServiceSettingsDto,
  VehicleTripHistoryPageDto,
  VehicleTripHistoryQueryDto,
} from './dto/vehicle-settings.dto';
import { VehicleSettingsService } from './vehicle-settings.service';
import { VehicleTripHistoryService } from './vehicle-trip-history.service';

/**
 * Thiết lập vận hành theo xe + lịch sử chuyến của xe (08/09/2026) — tenant-scoped, cùng quyền
 * với hồ sơ xe: xem = `vehicles.view`, ghi = `vehicles.update`. Lịch sử chuyến đòi CẢ hai quyền
 * xem đơn và xem yêu cầu vì nó trộn hai nguồn. Owner Lite (`/account`) và `/manage` gọi chung.
 *
 * Bậc CƠ BẢN (ADR 0027 điều 1): đây là "đăng xe / nhận yêu cầu / giao nhận" — không gắn cờ gói.
 */
@ApiTags('vehicles')
@Controller('vehicles')
@TenantScoped()
export class VehicleSettingsController {
  constructor(
    private readonly settings: VehicleSettingsService,
    private readonly history: VehicleTripHistoryService,
  ) {}

  @Get(':id/operation-settings')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Khung giờ giao/nhận và thời gian chết giữa hai chuyến của xe' })
  @ApiOkResponse({ type: VehicleOperationSettingsDto })
  getOperation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleOperationSettingsDto> {
    return this.settings.getOperation(tenant.tenantId, id);
  }

  @Put(':id/operation-settings')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({
    summary: 'Lưu khung giờ giao/nhận + thời gian chết (áp cho lịch giữ mới, không sửa lịch cũ)',
  })
  @ApiOkResponse({ type: VehicleOperationSettingsDto })
  saveOperation(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVehicleOperationSettingsDto,
  ): Promise<VehicleOperationSettingsDto> {
    return this.settings.saveOperation(tenant.tenantId, id, user.id, dto);
  }

  @Get(':id/service-settings')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Thiết lập tự động nhận / giấy tờ / điều khoản theo dịch vụ của xe' })
  @ApiOkResponse({ type: VehicleServiceSettingsDto })
  async listServiceSettings(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleServiceSettingsDto> {
    return { items: await this.settings.listServiceSettings(tenant.tenantId, id, tenant.features) };
  }

  @Patch(':id/service-settings/:serviceType')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({
    summary: 'Sửa một phần thiết lập của một dịch vụ (trường không gửi giữ nguyên)',
  })
  @ApiOkResponse({ type: VehicleServiceSettingDto })
  patchServiceSetting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('serviceType') serviceType: string,
    @Body() dto: PatchVehicleServiceSettingDto,
  ): Promise<VehicleServiceSettingDto> {
    return this.settings.patchServiceSetting(
      tenant.tenantId,
      id,
      serviceType,
      user.id,
      dto,
      tenant.features,
    );
  }

  @Get(':id/driver-surcharge-rules')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Mức phụ phí mặc định của dịch vụ có tài xế (công bố trước với khách)' })
  @ApiOkResponse({ type: DriverSurchargeRulesDto })
  async listSurchargeRules(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<DriverSurchargeRulesDto> {
    return { items: await this.settings.listSurchargeRules(tenant.tenantId, id) };
  }

  @Put(':id/driver-surcharge-rules')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Lưu mức phụ phí mặc định có tài xế (đủ bốn loại)' })
  @ApiOkResponse({ type: DriverSurchargeRulesDto })
  async saveSurchargeRules(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveDriverSurchargeRulesDto,
  ): Promise<DriverSurchargeRulesDto> {
    return { items: await this.settings.saveSurchargeRules(tenant.tenantId, id, user.id, dto) };
  }

  @Get(':id/trip-history')
  @RequirePermissions(PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW)
  @ApiOperation({
    summary: 'Lịch sử chuyến của một xe — đơn thuê + yêu cầu chưa thành đơn, trộn và phân trang ở DB',
  })
  @ApiOkResponse({ type: VehicleTripHistoryPageDto })
  tripHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: VehicleTripHistoryQueryDto,
  ): Promise<VehicleTripHistoryPageDto> {
    return this.history.list(tenant.tenantId, id, query);
  }
}
