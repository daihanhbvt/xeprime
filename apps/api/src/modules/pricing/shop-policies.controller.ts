import { Body, Controller, Get, Put, Query } from '@nestjs/common';
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
  SaveRentalPolicyDto,
  ShopPolicyQueryDto,
  ShopRentalPolicyDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (Wave 2 — B2; tách theo LOẠI XE 17/08). Áp cho mọi
 * xe cùng loại chưa ghi đè riêng; bỏ `vehicleType` = hàng legacy toàn gian hàng (tương thích).
 * `tenantId` từ membership (CLAUDE.md mục 5) — không nhận từ client. PUT ghi audit
 * `rental_policy.update` kèm before/after (thay đổi nhạy cảm ảnh hưởng giá mọi lượt đặt mới;
 * đơn đã chốt giữ nguyên snapshot).
 */
@ApiTags('rental-policies')
@Controller('shop/rental-policies')
@TenantScoped()
export class ShopPoliciesController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @ApiOperation({ summary: 'Chính sách thuê mặc định (theo loại xe) + số xe kế thừa/ghi đè' })
  @ApiOkResponse({ type: ShopRentalPolicyDto })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ShopPolicyQueryDto,
  ): Promise<ShopRentalPolicyDto> {
    return this.pricing.getShopPolicy(tenant.tenantId, query.vehicleType);
  }

  @Put()
  @RequirePermissions(PERMISSION.TENANT_UPDATE)
  @ApiOperation({ summary: 'Lưu chính sách thuê mặc định theo loại xe (upsert, audit)' })
  @ApiOkResponse({ type: ShopRentalPolicyDto })
  save(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ShopPolicyQueryDto,
    @Body() dto: SaveRentalPolicyDto,
  ): Promise<ShopRentalPolicyDto> {
    return this.pricing.saveShopPolicy(tenant.tenantId, user.id, dto, query.vehicleType);
  }
}
