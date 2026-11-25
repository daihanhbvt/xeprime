import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  AssignableInternalDriversDto,
  AssignableInternalDriversQueryDto,
  CreateInternalDriverDto,
  InternalDriverDto,
  InternalDriverListQueryDto,
  InternalDriverPageDto,
  UpdateInternalDriverDto,
} from './dto/internal-driver.dto';
import { InternalDriversService } from './internal-drivers.service';

/**
 * Danh bạ tài xế NỘI BỘ của bên thuê (ADR 0108) — người không có tài khoản XePrime. Tenant-scoped,
 * mở cho cả hai tuyến như module tài xế. Gán vào ĐƠN vẫn ở `PATCH /bookings/:id/driver`
 * (`{ internalDriverId }`, quyền `bookings.update`).
 */
@ApiTags('drivers')
@Controller('internal-drivers')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class InternalDriversController {
  constructor(private readonly internalDrivers: InternalDriversService) {}

  @Get()
  @RequirePermissions(PERMISSION.DRIVER_VIEW)
  @ApiOperation({ summary: 'Danh bạ tài xế nội bộ (tìm theo tên/SĐT, đang dùng hoặc đã lưu trữ)' })
  @ApiOkResponse({ type: InternalDriverPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: InternalDriverListQueryDto,
  ): Promise<InternalDriverPageDto> {
    return this.internalDrivers.list(tenant.tenantId, query);
  }

  @Get('assignable')
  @RequirePermissions(PERMISSION.DRIVER_VIEW)
  @ApiOperation({ summary: 'Tài xế nội bộ cho bộ chọn gán đơn - kèm cờ bận theo khung giờ' })
  @ApiOkResponse({ type: AssignableInternalDriversDto })
  assignable(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AssignableInternalDriversQueryDto,
  ): Promise<AssignableInternalDriversDto> {
    return this.internalDrivers.assignable(tenant.tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Thêm tài xế nội bộ (409 `INTERNAL_DRIVER_PHONE_TAKEN` khi trùng SĐT)' })
  @ApiCreatedResponse({ type: InternalDriverDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInternalDriverDto,
  ): Promise<InternalDriverDto> {
    return this.internalDrivers.create(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({
    summary:
      'Sửa tài xế nội bộ (đơn đã gán giữ tên/SĐT cũ; đã lưu trữ ⇒ 409 `INTERNAL_DRIVER_ARCHIVED`)',
  })
  @ApiOkResponse({ type: InternalDriverDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInternalDriverDto,
  ): Promise<InternalDriverDto> {
    return this.internalDrivers.update(tenant.tenantId, user.id, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Lưu trữ tài xế nội bộ (thay cho xoá - đơn đã gán giữ nguyên)' })
  @ApiOkResponse({ type: InternalDriverDto })
  archive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InternalDriverDto> {
    return this.internalDrivers.archive(tenant.tenantId, user.id, id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Khôi phục tài xế nội bộ đã lưu trữ' })
  @ApiOkResponse({ type: InternalDriverDto })
  restore(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InternalDriverDto> {
    return this.internalDrivers.restore(tenant.tenantId, user.id, id);
  }
}
