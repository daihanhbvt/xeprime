import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  SaveShopOperationDefaultsDto,
  ShopOperationDefaultsDto,
  ShopOperationDefaultsQueryDto,
} from './dto/vehicle-settings.dto';
import { VehicleSettingsService } from './vehicle-settings.service';

/**
 * Thiết lập vận hành MẶC ĐỊNH của gian hàng theo loại xe (06/11/2026) — hiện là thời gian chết giữa
 * hai chuyến, đứng ở trang "Chính sách thuê" cạnh `/shop/rental-policies` nên cùng quyền với nó:
 * xem = `tenant.view`, ghi = `tenant.update`. Phiên hỗ trợ chỉ ĐỌC (như chính sách thuê).
 * `tenantId` từ membership — không nhận từ client.
 */
@ApiTags('rental-policies')
@Controller('shop/operation-defaults')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class ShopOperationDefaultsController {
  constructor(private readonly settings: VehicleSettingsService) {}

  @Get()
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW)
  @ApiOperation({ summary: 'Thời gian chết mặc định của gian hàng theo loại xe' })
  @ApiOkResponse({ type: ShopOperationDefaultsDto })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ShopOperationDefaultsQueryDto,
  ): Promise<ShopOperationDefaultsDto> {
    return this.settings.getShopOperationDefaults(tenant.tenantId, query.vehicleType);
  }

  @Put()
  @RequirePermissions(PERMISSION.TENANT_UPDATE)
  @ApiOperation({
    summary:
      'Lưu thời gian chết mặc định theo loại xe (áp cho lịch giữ mới của xe đang theo mặc định)',
  })
  @ApiOkResponse({ type: ShopOperationDefaultsDto })
  save(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ShopOperationDefaultsQueryDto,
    @Body() dto: SaveShopOperationDefaultsDto,
  ): Promise<ShopOperationDefaultsDto> {
    return this.settings.saveShopOperationDefaults(
      tenant.tenantId,
      query.vehicleType,
      user.id,
      dto,
    );
  }
}
