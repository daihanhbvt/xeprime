import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  PERMISSION,
  SUPPORT_CAPABILITY,
} from '@xeprime/types';
import { CurrentTenant, CurrentUser, Realms, RequirePermissions, SupportAction, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  SaveRentalPolicyDto,
  ShopInsuranceImpactDto,
  ShopPolicyQueryDto,
  ShopRentalPolicyDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';
import {
  SaveTenantRentalTermsDto,
  TenantRentalTermsDto,
} from '../vehicle-settings/dto/tenant-rental-terms.dto';
import { TenantRentalTermsService } from '../vehicle-settings/tenant-rental-terms.service';

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
@Realms(ACCOUNT_REALM.PARTNER)
export class ShopPoliciesController {
  constructor(
    private readonly pricing: PricingService,
    private readonly rentalTerms: TenantRentalTermsService,
  ) {}

  /*
   * Điều khoản thuê của GIAN HÀNG theo nhóm dịch vụ (ADR 0112 điều 3). Cùng quyền với chính sách
   * thuê mặc định; khai TRƯỚC `@Get()` gốc không cần - đường dẫn khác hẳn.
   */
  @Get('terms')
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW)
  @ApiOperation({ summary: 'Điều khoản thuê của gian hàng (Tự lái & Dài hạn · Có tài xế)' })
  @ApiOkResponse({ type: TenantRentalTermsDto })
  getTerms(@CurrentTenant() tenant: TenantContext): Promise<TenantRentalTermsDto> {
    return this.rentalTerms.get(tenant.tenantId);
  }

  @Put('terms')
  @RequirePermissions(PERMISSION.TENANT_UPDATE)
  @ApiOperation({ summary: 'Lưu điều khoản thuê của gian hàng theo nhóm dịch vụ (upsert, audit)' })
  @ApiOkResponse({ type: TenantRentalTermsDto })
  saveTerms(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveTenantRentalTermsDto,
  ): Promise<TenantRentalTermsDto> {
    return this.rentalTerms.save(tenant.tenantId, user.id, dto);
  }

  @Get()
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW)
  @ApiOperation({ summary: 'Chính sách thuê mặc định (theo loại xe) + số xe kế thừa/ghi đè' })
  @ApiOkResponse({ type: ShopRentalPolicyDto })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ShopPolicyQueryDto,
  ): Promise<ShopRentalPolicyDto> {
    return this.pricing.getShopPolicy(tenant.tenantId, query.vehicleType);
  }

  @Get('insurance-impact')
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW)
  @ApiOperation({
    summary:
      'Xe kế thừa chính sách gian hàng mà thiếu dữ liệu bảo hiểm - sẽ ngừng nhận đặt tự lái nếu chọn Bắt buộc (ADR 0091)',
  })
  @ApiOkResponse({ type: ShopInsuranceImpactDto })
  insuranceImpact(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ShopPolicyQueryDto,
  ): Promise<ShopInsuranceImpactDto> {
    return this.pricing.shopInsuranceImpact(tenant.tenantId, query.vehicleType);
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
