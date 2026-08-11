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
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CreateVehicleDto,
  FleetSummaryDto,
  UpdateVehicleDto,
  Vehicle360SummaryDto,
  VehicleDetailDto,
  VehiclePageDto,
  VehicleListQueryDto,
  VehicleStatsListDto,
  VehicleStatsQueryDto,
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

  /**
   * Chỉ số cho thẻ xe ở `/manage/vehicles`.
   *
   * **Phải khai TRƯỚC `@Get(':id')`** — Nest khớp route theo thứ tự khai báo, đặt sau thì `stats`
   * bị nuốt thành một id và trả 404.
   *
   * Số liệu tài chính chỉ đi kèm khi người gọi có `finance.view`; kiểm ở đây chứ không ở FE,
   * vì ẩn con số trong UI không ngăn được ai đọc thẳng response.
   */
  @Get('stats')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Chỉ số vận hành/tài chính luỹ kế theo xe' })
  @ApiOkResponse({ type: VehicleStatsListDto })
  async stats(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleStatsQueryDto,
  ): Promise<VehicleStatsListDto> {
    const canViewFinance = tenant.permissions.includes(PERMISSION.FINANCE_VIEW);
    return { data: await this.vehicles.stats(tenant.tenantId, query.ids, canViewFinance) };
  }

  /** Cùng lý do thứ tự với `stats`: route tĩnh phải đứng trước `:id`. */
  @Get('fleet-summary')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Đếm đội xe theo trạng thái vận hành (dải chỉ số đầu danh sách)' })
  @ApiOkResponse({ type: FleetSummaryDto })
  fleetSummary(@CurrentTenant() tenant: TenantContext): Promise<FleetSummaryDto> {
    return this.vehicles.fleetSummary(tenant.tenantId);
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

  /**
   * Tổng hợp cho trang Hồ sơ 360 — một request thay vì FE tự ghép stats + đơn sắp tới + hoạt
   * động. Khối đơn thuê/tài chính gate theo quyền BÊN TRONG service: response chỉ chứa phần
   * người gọi được thấy (cùng nguyên tắc với `stats`).
   */
  @Get(':id/summary')
  @RequirePermissions(PERMISSION.VEHICLE_VIEW)
  @ApiOperation({ summary: 'Tổng hợp Hồ sơ 360 của một xe (chỉ số + đơn thuê theo quyền)' })
  @ApiOkResponse({ type: Vehicle360SummaryDto })
  summary(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<Vehicle360SummaryDto> {
    return this.vehicles.summary360(tenant.tenantId, id, {
      canViewFinance: tenant.permissions.includes(PERMISSION.FINANCE_VIEW),
      canViewBookings: tenant.permissions.includes(PERMISSION.BOOKING_VIEW),
    });
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
  @ApiOperation({
    summary: 'Sửa thông tin xe (sửa trường nhạy cảm khi đang công khai → chờ duyệt lại)',
  })
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
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ id: string }> {
    return this.vehicles.remove(tenant.tenantId, id);
  }
}
