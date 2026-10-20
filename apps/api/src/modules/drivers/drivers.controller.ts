import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import { OkResultDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { DriversService } from './drivers.service';
import {
  AssignableDriversDto,
  AssignableDriversQueryDto,
  DriverDto,
  DriverListQueryDto,
  DriverPageDto,
  InviteDriverDto,
  UpdateDriverDto,
} from './dto/driver.dto';

/**
 * Tài xế LIÊN KẾT của bên thuê (ADR 0063) — tenant-scoped, `tenantId` từ membership của phiên.
 *
 * Mở cho CẢ HAI tuyến: chủ xe tuyến hoa hồng cũng thuê tài xế (quyết định sản phẩm 16/10/2026),
 * nên module này không còn sau `@SubscriptionTrackOnly()` / `@RequiresFeature(DRIVERS)`. Gán tài
 * xế vào ĐƠN vẫn ở `PATCH /bookings/:id/driver` (quyền `bookings.update`).
 */
@ApiTags('drivers')
@Controller('drivers')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @RequirePermissions(PERMISSION.DRIVER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.DRIVER_VIEW)
  @ApiOperation({ summary: 'Danh sách tài xế liên kết (lọc trạng thái liên kết, phân trang)' })
  @ApiOkResponse({ type: DriverPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: DriverListQueryDto,
  ): Promise<DriverPageDto> {
    return this.drivers.list(tenant.tenantId, query);
  }

  @Get('assignable')
  @RequirePermissions(PERMISSION.DRIVER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.DRIVER_VIEW)
  @ApiOperation({
    summary: 'Tài xế cho bộ chọn gán đơn — kèm cờ bận (theo người, mọi bên thuê) và mức bằng lái',
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
  @ApiOperation({
    summary: 'Mời tài xế theo SĐT tài khoản khách',
    description:
      'SĐT phải là tài khoản khách đã xác minh — không có thì 404 `DRIVER_ACCOUNT_NOT_FOUND`. ' +
      'Đã có lời mời / liên kết đang mở thì 409 `DRIVER_ALREADY_LINKED`.',
  })
  @ApiCreatedResponse({ type: DriverDto })
  invite(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.invite(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Sửa tên gọi / loại / ghi chú của một liên kết tài xế' })
  @ApiOkResponse({ type: DriverDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.update(tenant.tenantId, user.id, id, dto);
  }

  @Post(':id/suspend')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Tạm khoá tài xế — giữ chuyến đã gán, chặn gán mới' })
  @ApiOkResponse({ type: DriverDto })
  suspend(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverDto> {
    return this.drivers.setSuspended(tenant.tenantId, user.id, id, true);
  }

  @Post(':id/resume')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({ summary: 'Mở khoá tài xế' })
  @ApiOkResponse({ type: DriverDto })
  resume(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DriverDto> {
    return this.drivers.setSuspended(tenant.tenantId, user.id, id, false);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSION.DRIVER_MANAGE)
  @ApiOperation({
    summary: 'Thu hồi lời mời / kết thúc liên kết tài xế',
    description:
      'Chuyến chưa nhận xe được gỡ tài xế (gán người khác). Còn chuyến đang chạy thì 409 ' +
      '`DRIVER_HAS_ACTIVE_TRIP`. Dòng liên kết ở lại làm lịch sử cho các đơn đã chạy.',
  })
  @ApiOkResponse({ type: OkResultDto })
  async end(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.drivers.endByEmployer(tenant.tenantId, user.id, id);
    return { ok: true };
  }
}
