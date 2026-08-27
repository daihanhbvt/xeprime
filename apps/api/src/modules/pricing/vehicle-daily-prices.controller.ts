import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import { DeletedCountDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { PricingService } from './pricing.service';
import {
  DailyPriceQueryDto,
  DeleteDailyPricesDto,
  SaveDailyPricesDto,
  VehicleDailyPriceDto,
} from './dto/vehicle-daily-price.dto';

/**
 * Giá riêng theo ngày của một xe (`vehicle_daily_prices`).
 *
 * ĐỌC chỉ cần `calendar.view` (lịch hiện dấu giá riêng cho mọi người xem — giá thuê vốn công
 * khai ngoài chợ); GHI/XOÁ cần `vehicles.update` — cùng quyền với sửa giá thường của xe.
 * Mọi báo giá (public quote, duyệt yêu cầu) đọc bản ghi đè qua `PricingService`.
 */
@ApiTags('pricing')
@Controller('vehicles/:id/daily-prices')
@TenantScoped()
export class VehicleDailyPricesController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @ApiOperation({ summary: 'Bản ghi đè giá theo ngày trong [from, to] (ngày local VN)' })
  @ApiOkResponse({ type: VehicleDailyPriceDto, isArray: true })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') vehicleId: string,
    @Query() query: DailyPriceQueryDto,
  ): Promise<VehicleDailyPriceDto[]> {
    return this.pricing.listDailyPrices(tenant.tenantId, vehicleId, query.from, query.to);
  }

  @Put()
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Đặt giá riêng cho các ngày (upsert tất định theo (xe, ngày))' })
  @ApiOkResponse({ type: VehicleDailyPriceDto, isArray: true })
  save(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: SaveDailyPricesDto,
  ): Promise<VehicleDailyPriceDto[]> {
    return this.pricing.saveDailyPrices(tenant.tenantId, vehicleId, user.id, dto);
  }

  @Delete()
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Khôi phục giá mặc định cho [from, to] — xoá bản ghi đè' })
  @ApiOkResponse({ type: DeletedCountDto })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Query() query: DeleteDailyPricesDto,
  ): Promise<{ deleted: number }> {
    const deleted = await this.pricing.deleteDailyPrices(
      tenant.tenantId,
      vehicleId,
      user.id,
      query.from,
      query.to,
    );
    return { deleted };
  }
}
