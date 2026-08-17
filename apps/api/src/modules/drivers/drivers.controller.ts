import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { DriversService } from './drivers.service';
import {
  AssignableDriversDto,
  AssignableDriversQueryDto,
  CreateDriverDto,
  DriverDto,
  DriverListQueryDto,
  DriverPageDto,
  UpdateDriverDto,
} from './dto/driver.dto';

/**
 * Hồ sơ tài xế của gian hàng — tenant-scoped, `tenantId` từ membership của phiên (CLAUDE.md
 * mục 5). DELETE là soft-delete và bị chặn khi còn đơn "sống" đang gán; gán tài xế vào ĐƠN
 * nằm ở `PATCH /bookings/:id/driver` (quyền `bookings.update`).
 */
@ApiTags('drivers')
@Controller('drivers')
@TenantScoped()
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @RequirePermissions(PERMISSION.DRIVER_VIEW)
  @ApiOperation({ summary: 'Danh sách tài xế (tìm kiếm/lọc trạng thái, phân trang)' })
  @ApiOkResponse({ type: DriverPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: DriverListQueryDto,
  ): Promise<DriverPageDto> {
    return this.drivers.list(tenant.tenantId, query);
  }

  @Get('assignable')
  @RequirePermissions(PERMISSION.DRIVER_VIEW)
  @ApiOperation({
    summary: 'Tài xế cho bộ chọn gán đơn — kèm cờ bận khung giờ / GPLX hết hạn (17/08)',
  })
  @ApiOkResponse({ type: AssignableDriversDto })
  async assignable(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AssignableDriversQueryDto,
  ): Promise<AssignableDriversDto> {
    const data = await this.drivers.assignable(tenant.tenantId, {
      pickupAt: new Date(query.pickupAt),
      returnAt: new Date(query.returnAt),
      excludeBookingId: query.excludeBookingId,
    });
    return { data };
  }

  @Post()
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Thêm tài xế' })
  @ApiCreatedResponse({ type: DriverDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.create(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Sửa hồ sơ / đổi trạng thái tài xế' })
  @ApiOkResponse({ type: DriverDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.update(tenant.tenantId, user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Xoá tài xế (soft-delete; chặn khi còn đơn chưa hoàn tất)' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.drivers.remove(tenant.tenantId, user.id, id);
    return { ok: true };
  }
}
