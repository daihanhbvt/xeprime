import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import type { TenantContext } from '../../common/types/request-context';
import { BulkDayService } from './bulk-day.service';
import {
  BulkDayBlockDto,
  BulkDayBlockResultDto,
  BulkDayPreviewDto,
  BulkDayPriceDto,
  BulkDayPriceResultDto,
  BulkDayQueryDto,
  BulkDayReleaseResultDto,
} from './dto/bulk-day.dto';

/**
 * Thao tác cả ĐỘI XE cho một khoảng ngày — mở từ thẻ ngày trên lưới lịch.
 *
 * Quyền chia đúng như thao tác lẻ tương ứng: khoá xe cần `vehicles.block_schedule`, đặt giá cần
 * `vehicles.update`. Làm hàng loạt KHÔNG mở thêm quyền nào — nó chỉ là cùng một hành động lặp
 * lại, nên ai không được khoá một chiếc thì cũng không được khoá bốn mươi chiếc.
 *
 * Bảng xem trước dùng `calendar.view`: nó chỉ đọc, và cả hai dialog đều cần nó.
 */
@ApiTags('calendar')
@Controller('calendar/bulk-day')
@TenantScoped()
export class BulkDayController {
  constructor(private readonly bulk: BulkDayService) {}

  @Get('preview')
  @RequirePermissions(PERMISSION.CALENDAR_VIEW)
  @ApiOperation({
    summary: 'Xem trước tập xe bị ảnh hưởng bởi một thao tác hàng loạt',
    description:
      'Trả giá NIÊM YẾT của từng xe và những ngày xe đang bận. Phép tính giá mới nằm ở hàm ' +
      'thuần `planBulkDayPrices` của @xeprime/domain — client và server dùng chung, nên bảng ' +
      'xem trước và dòng ghi xuống DB không thể lệch nhau.',
  })
  @ApiOkResponse({ type: BulkDayPreviewDto })
  async preview(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BulkDayQueryDto,
  ): Promise<BulkDayPreviewDto> {
    return this.bulk.preview(tenant.tenantId, query);
  }

  @Post('blocks')
  @RequirePermissions(PERMISSION.VEHICLE_BLOCK_SCHEDULE)
  @ApiOperation({
    summary: 'Khoá mọi xe được chọn trong khoảng ngày',
    description:
      'Chỉ khoá những cặp (xe, ngày) đang RẢNH — xe có đơn thì bỏ qua đúng ngày đó (ADR 0006). ' +
      'Kết quả nói rõ bao nhiêu xe khoá đủ, khoá một phần, hoặc không khoá được ngày nào. ' +
      'Mọi dòng mang chung một `batchId` để gỡ lại được.',
  })
  @ApiOkResponse({ type: BulkDayBlockResultDto })
  async blockAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDayBlockDto,
  ): Promise<BulkDayBlockResultDto> {
    return this.bulk.blockAll(tenant.tenantId, user.id, dto);
  }

  @Delete('blocks/:batchId')
  @RequirePermissions(PERMISSION.VEHICLE_BLOCK_SCHEDULE)
  @ApiOperation({
    summary: 'Gỡ trọn một lô khoá hàng loạt',
    description:
      'Gỡ ĐÚNG những dòng lô đó tạo ra. Lịch khoá do người dùng đặt tay không bị đụng tới.',
  })
  @ApiOkResponse({ type: BulkDayReleaseResultDto })
  async releaseBatch(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('batchId') batchId: string,
  ): Promise<BulkDayReleaseResultDto> {
    return this.bulk.releaseBatch(tenant.tenantId, user.id, batchId);
  }

  @Put('prices')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({
    summary: 'Đặt giá riêng cho mọi xe được chọn trong khoảng ngày',
    description:
      '`percent` tính trên giá niêm yết của TỪNG xe cho ĐÚNG ngày đó (giá cuối tuần nếu là ' +
      'T7/CN), và luôn lấy giá niêm yết làm gốc — nên bấm nhiều lần không cộng dồn. Xe chưa ' +
      'cấu hình giá bị bỏ qua thay vì bị đặt thành 0₫.',
  })
  @ApiOkResponse({ type: BulkDayPriceResultDto })
  async priceAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDayPriceDto,
  ): Promise<BulkDayPriceResultDto> {
    return this.bulk.priceAll(tenant.tenantId, user.id, dto);
  }

  @Post('prices/restore')
  @RequirePermissions(PERMISSION.VEHICLE_UPDATE)
  @ApiOperation({
    summary: 'Khôi phục giá mặc định cho mọi xe được chọn trong khoảng ngày',
    description: 'Xoá bản ghi đè theo ngày; giá thường/cuối tuần áp trở lại ngay ở mọi báo giá.',
  })
  @ApiOkResponse({ type: BulkDayPriceResultDto })
  async restorePrices(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDayPriceDto,
  ): Promise<BulkDayPriceResultDto> {
    return this.bulk.restorePrices(tenant.tenantId, user.id, dto);
  }
}
