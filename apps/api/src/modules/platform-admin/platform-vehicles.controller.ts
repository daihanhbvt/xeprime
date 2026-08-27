import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  HideVehicleDto,
  PlatformVehicleDetailDto,
  PlatformVehicleListQueryDto,
  PlatformVehiclePageDto,
} from './dto/platform-vehicle.dto';
import { PlatformVehiclesService } from './platform-vehicles.service';

/**
 * Xe toàn hệ thống (Phase 7 — build plan §11.1). Đọc mở cho mọi nhân sự nền tảng có
 * `platform.vehicles.view`; ẩn/bỏ ẩn đòi quyền kiểm duyệt riêng và luôn ghi audit.
 */
@ApiTags('platform-vehicles')
@Controller('platform/vehicles')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_VEHICLE_VIEW)
export class PlatformVehiclesController {
  constructor(private readonly vehicles: PlatformVehiclesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách xe toàn hệ thống (phân trang, lọc, tìm kiếm)' })
  @ApiOkResponse({ type: PlatformVehiclePageDto })
  list(@Query() query: PlatformVehicleListQueryDto): Promise<PlatformVehiclePageDto> {
    return this.vehicles.list(query) as Promise<PlatformVehiclePageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một xe (kèm gian hàng chủ quản, số đơn, số đánh giá)' })
  @ApiOkResponse({ type: PlatformVehicleDetailDto })
  getOne(@Param('id') id: string): Promise<PlatformVehicleDetailDto> {
    return this.vehicles.getOne(id);
  }

  // `RequirePermissions` ở handler GHI ĐÈ cấp class (PermissionGuard dùng getAllAndOverride),
  // nên phải liệt kê lại cả quyền đọc — nếu không, một role chỉ có `moderate` sẽ ẩn được xe
  // mà không có quyền xem danh sách xe.
  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_VEHICLE_VIEW, PERMISSION.PLATFORM_VEHICLE_MODERATE)
  @ApiOperation({ summary: 'Ẩn xe vi phạm khỏi Marketplace (đang hiển thị → đã ẩn)' })
  @ApiOkResponse({ type: PlatformVehicleDetailDto })
  hide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: HideVehicleDto,
  ): Promise<PlatformVehicleDetailDto> {
    return this.vehicles.hide(id, user.id, dto);
  }

  @Post(':id/unhide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_VEHICLE_VIEW, PERMISSION.PLATFORM_VEHICLE_MODERATE)
  @ApiOperation({ summary: 'Bỏ ẩn xe (đã ẩn → hiển thị lại trên Marketplace)' })
  @ApiOkResponse({ type: PlatformVehicleDetailDto })
  unhide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformVehicleDetailDto> {
    return this.vehicles.unhide(id, user.id);
  }
}
