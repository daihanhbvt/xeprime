import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentTenantDto } from './dto/current-tenant.dto';
import {
  MyShopDto,
  RegisterShopDto,
  UpdateTenantProfileDto,
} from './dto/tenant-onboarding.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Đăng ký gian hàng — dành cho user CHƯA thuộc tenant nào, nên KHÔNG `@TenantScoped`
   * (marker đó sẽ đòi tenant scope và chặn mất). Ai cũng đăng ký được; service từ chối nếu
   * đã có gian hàng.
   */
  @Post()
  @ApiOperation({ summary: 'Đăng ký gian hàng mới (tạo ở trạng thái nháp)' })
  @ApiCreatedResponse({ type: MyShopDto })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterShopDto,
  ): Promise<MyShopDto> {
    return this.tenants.registerShop(user.id, dto);
  }

  /**
   * Không có tham số `tenantId` — đó là chủ ý, không phải thiếu sót.
   * CLAUDE.md mục 5: API tenant-sensitive không nhận `tenant_id` từ client.
   */
  @Get('current')
  @TenantScoped()
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @ApiOperation({ summary: 'Gian hàng của user hiện tại (scope lấy từ membership)' })
  @ApiOkResponse({ type: CurrentTenantDto })
  async current(@CurrentTenant() tenant: TenantContext): Promise<CurrentTenantDto> {
    const row = await this.prisma.tenant.findFirstOrThrow({
      where: { id: tenant.tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        slug: true,
        name: true,
        tenantType: true,
        status: true,
        phone: true,
        email: true,
        ratingAvg: true,
        ratingCount: true,
        _count: { select: { vehicles: true, memberships: true } },
      },
    });

    return {
      id: row.id,
      code: row.code,
      slug: row.slug,
      name: row.name,
      tenantType: row.tenantType,
      status: row.status,
      phone: row.phone,
      email: row.email,
      ratingAvg: row.ratingAvg.toString(),
      ratingCount: row.ratingCount,
      vehicleCount: row._count.vehicles,
      memberCount: row._count.memberships,
      myRoleKey: tenant.roleKey,
    };
  }

  @Get('current/shop')
  @TenantScoped()
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @ApiOperation({ summary: 'Hồ sơ gian hàng của tôi + trạng thái duyệt' })
  @ApiOkResponse({ type: MyShopDto })
  myShop(@CurrentTenant() tenant: TenantContext): Promise<MyShopDto> {
    return this.tenants.getMyShop(tenant.tenantId);
  }

  @Patch('current/profile')
  @TenantScoped()
  @RequirePermissions(PERMISSION.TENANT_UPDATE)
  @ApiOperation({ summary: 'Cập nhật hồ sơ gian hàng' })
  @ApiOkResponse({ type: MyShopDto })
  updateProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantProfileDto,
  ): Promise<MyShopDto> {
    // `userId` cần cho nhánh đổi tỉnh: nó dời chi nhánh mặc định và việc đó phải ghi audit có tên.
    return this.tenants.updateProfile(tenant.tenantId, user.id, dto);
  }

  @Post('current/submit-review')
  @HttpCode(HttpStatus.OK)
  @TenantScoped()
  @RequirePermissions(PERMISSION.TENANT_SUBMIT_REVIEW)
  @ApiOperation({ summary: 'Gửi hồ sơ gian hàng cho nền tảng duyệt' })
  @ApiOkResponse({ type: MyShopDto })
  submitReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyShopDto> {
    return this.tenants.submitForReview(tenant.tenantId, user.id);
  }
}
