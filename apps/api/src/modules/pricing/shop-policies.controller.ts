import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { SaveRentalPolicyDto, ShopRentalPolicyDto } from './dto/pricing.dto';
import { PricingService } from './pricing.service';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (Wave 2 — B2). Áp cho mọi xe chưa ghi đè riêng.
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
  @ApiOperation({ summary: 'Chính sách thuê mặc định + số xe kế thừa/ghi đè' })
  @ApiOkResponse({ type: ShopRentalPolicyDto })
  get(@CurrentTenant() tenant: TenantContext): Promise<ShopRentalPolicyDto> {
    return this.pricing.getShopPolicy(tenant.tenantId);
  }

  @Put()
  @RequirePermissions(PERMISSION.TENANT_UPDATE)
  @ApiOperation({ summary: 'Lưu chính sách thuê mặc định (upsert, audit before/after)' })
  @ApiOkResponse({ type: ShopRentalPolicyDto })
  save(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveRentalPolicyDto,
  ): Promise<ShopRentalPolicyDto> {
    return this.pricing.saveShopPolicy(tenant.tenantId, user.id, dto);
  }
}
