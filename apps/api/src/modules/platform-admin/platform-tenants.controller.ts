import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  LockTenantDto,
  PlatformTenantDetailDto,
  PlatformTenantListQueryDto,
  PlatformTenantPageDto,
} from './dto/platform-tenant.dto';
import { PlatformTenantsService } from './platform-tenants.service';

/**
 * Quản lý gian hàng ở cấp nền tảng (Phase 7). `@PlatformOnly` (PlatformScopeGuard) — KHÔNG dùng
 * chung guard với API gian hàng. Khoá/mở khoá đổi `Tenant.status` (marketplace tôn trọng tức thì,
 * ADR 0008) + ghi audit.
 */
@ApiTags('platform-tenants')
@Controller('platform/tenants')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_TENANT_MANAGE)
export class PlatformTenantsController {
  constructor(private readonly tenants: PlatformTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách gian hàng (phân trang, lọc trạng thái, tìm kiếm)' })
  @ApiOkResponse({ type: PlatformTenantPageDto })
  list(@Query() query: PlatformTenantListQueryDto): Promise<PlatformTenantPageDto> {
    return this.tenants.list(query) as Promise<PlatformTenantPageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một gian hàng' })
  @ApiOkResponse({ type: PlatformTenantDetailDto })
  getOne(@Param('id') id: string): Promise<PlatformTenantDetailDto> {
    return this.tenants.getOne(id);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khoá gian hàng (đang hoạt động → bị khoá)' })
  @ApiOkResponse({ type: PlatformTenantDetailDto })
  lock(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LockTenantDto,
  ): Promise<PlatformTenantDetailDto> {
    return this.tenants.lock(id, user.id, dto);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khoá gian hàng (bị khoá → hoạt động)' })
  @ApiOkResponse({ type: PlatformTenantDetailDto })
  unlock(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformTenantDetailDto> {
    return this.tenants.unlock(id, user.id);
  }
}
