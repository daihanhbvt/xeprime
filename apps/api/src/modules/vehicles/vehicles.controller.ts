import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleDetailDto,
  VehiclePageDto,
  VehicleListQueryDto,
} from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

/**
 * Quản lý xe của gian hàng — tất cả tenant-scoped.
 *
 * `tenantId` LUÔN lấy từ `@CurrentTenant` (membership), không nhận từ client (CLAUDE.md mục 5).
 * Mỗi endpoint khai báo permission tương ứng; guard backend là lớp bảo vệ thật, ẩn nút ở FE
 * không bảo vệ gì.
 */
@ApiTags('vehicles')
@Controller('vehicles')
@TenantScoped()
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Danh sách xe của gian hàng (phân trang, filter, sort)' })
  @ApiOkResponse({ type: VehiclePageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleListQueryDto,
  ): Promise<VehiclePageDto> {
    return this.vehicles.list(tenant.tenantId, query) as Promise<VehiclePageDto>;
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Chi tiết một xe' })
  @ApiOkResponse({ type: VehicleDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.getOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSION.VEHICLE_CREATE)
  @ApiOperation({ summary: 'Thêm xe mới (mặc định trạng thái public = nháp)' })
  @ApiCreatedResponse({ type: VehicleDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVehicleDto,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.create(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Sửa thông tin xe (sửa trường nhạy cảm khi đang công khai → chờ duyệt lại)' })
  @ApiOkResponse({ type: VehicleDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.update(tenant.tenantId, id, user.id, dto);
  }

  @Post(':id/submit-public')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.VEHICLE_SUBMIT_PUBLIC)
  @ApiOperation({ summary: 'Gửi xe đi duyệt công khai (đi qua luồng duyệt nền tảng — ADR 0008)' })
  @ApiOkResponse({ type: VehicleDetailDto })
  submitPublic(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<VehicleDetailDto> {
    return this.vehicles.submitForPublicReview(tenant.tenantId, id, user.id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSION.VEHICLE_DELETE)
  @ApiOperation({ summary: 'Xoá mềm xe (chặn nếu còn lịch hiện tại/tương lai)' })
  @ApiOkResponse({ schema: { properties: { id: { type: 'string' } } } })
  remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<{ id: string }> {
    return this.vehicles.remove(tenant.tenantId, id);
  }
}
