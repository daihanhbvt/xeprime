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
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { VehicleBlocksService } from './vehicle-blocks.service';
import {
  CreateVehicleBlockDto,
  UpdateVehicleBlockDto,
  VehicleBlockDto,
} from './dto/vehicle-block.dto';

/**
 * Khoá xe thủ công (nguồn `blocked_range` trên lịch).
 *
 * Ghi cần `vehicles.block_schedule`; ĐỌC chi tiết chỉ cần `calendar.view` — người xem lịch bấm
 * vào một khoảng khoá phải biết nó là gì, dù không có quyền gỡ. Trùng lịch do exclusion
 * constraint quyết (ADR 0006) — 409 BOOKING_SCHEDULE_CONFLICT.
 */
@ApiTags('calendar')
@Controller('vehicle-blocks')
@TenantScoped()
export class VehicleBlocksController {
  constructor(private readonly blocks: VehicleBlocksService) {}

  @Get(':id')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Chi tiết một lịch khoá xe' })
  @ApiOkResponse({ type: VehicleBlockDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<VehicleBlockDto> {
    return this.blocks.getOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSION.VEHICLE_BLOCK_SCHEDULE)
  @ApiOperation({ summary: 'Khoá xe một khoảng thời gian (giữ chỗ lịch trong cùng transaction)' })
  @ApiCreatedResponse({ type: VehicleBlockDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVehicleBlockDto,
  ): Promise<VehicleBlockDto> {
    return this.blocks.create(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.VEHICLE_BLOCK_SCHEDULE)
  @ApiOperation({ summary: 'Sửa lịch khoá (optimistic concurrency, đồng bộ lịch xe)' })
  @ApiOkResponse({ type: VehicleBlockDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleBlockDto,
  ): Promise<VehicleBlockDto> {
    return this.blocks.update(tenant.tenantId, id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSION.VEHICLE_BLOCK_SCHEDULE)
  @ApiOperation({ summary: 'Gỡ khoá — NHẢ chỗ trên lịch xe trong cùng transaction' })
  @ApiNoContentResponse()
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.blocks.remove(tenant.tenantId, id, user.id);
  }
}
