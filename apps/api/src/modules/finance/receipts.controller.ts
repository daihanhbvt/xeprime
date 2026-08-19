import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CancelReceiptDto,
  CreateReceiptDto,
  ReceiptDetailDto,
  ReceiptBookingOptionListDto,
  ReceiptBookingOptionQueryDto,
  ReceiptListQueryDto,
  ReceiptPageDto,
  ReceiptSummaryDto,
} from './dto/finance.dto';
import { ReceiptsService } from './receipts.service';

/**
 * Phiếu thu/chi của gian hàng — tenant-scoped. `tenantId`/`userId` từ scope, không nhận từ client.
 * Workflow duyệt: tạo (chờ duyệt) → duyệt/huỷ; audit mọi thao tác.
 */
@ApiTags('receipts')
@Controller('receipts')
@TenantScoped()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Danh sách phiếu thu/chi (phân trang, filter)' })
  @ApiOkResponse({ type: ReceiptPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ReceiptListQueryDto,
  ): Promise<ReceiptPageDto> {
    return this.receipts.list(tenant.tenantId, query) as Promise<ReceiptPageDto>;
  }

  /**
   * ⚠️ Phải đứng TRƯỚC `@Get(':id')` — Nest khớp route theo thứ tự khai báo, để sau thì
   * `:id = 'summary'` và endpoint này trả 404 "Không tìm thấy phiếu".
   */
  @Get('summary')
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({
    summary: 'Tổng thu/chi của ĐÚNG bộ lọc đang xem — thẻ tổng phải khớp danh sách bên dưới',
  })
  @ApiOkResponse({ type: ReceiptSummaryDto })
  summary(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ReceiptListQueryDto,
  ): Promise<ReceiptSummaryDto> {
    return this.receipts.summary(tenant.tenantId, query);
  }

  /** Nguồn cho ô "Liên kết đơn thuê (auto-fill)" ở form tạo phiếu. Cũng phải trước `:id`. */
  @Get('booking-options')
  @RequirePermissions(PERMISSION.RECEIPT_CREATE)
  @ApiOperation({ summary: 'Đơn thuê gợi ý để gắn phiếu — ưu tiên đơn còn nợ' })
  @ApiOkResponse({ type: ReceiptBookingOptionListDto })
  async bookingOptions(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ReceiptBookingOptionQueryDto,
  ): Promise<ReceiptBookingOptionListDto> {
    return { data: await this.receipts.bookingOptions(tenant.tenantId, query.q) };
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Chi tiết phiếu' })
  @ApiOkResponse({ type: ReceiptDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<ReceiptDetailDto> {
    return this.receipts.getOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSION.RECEIPT_CREATE)
  @ApiOperation({ summary: 'Tạo phiếu thu/chi (chờ duyệt)' })
  @ApiCreatedResponse({ type: ReceiptDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReceiptDto,
  ): Promise<ReceiptDetailDto> {
    return this.receipts.create(tenant.tenantId, user.id, dto);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSION.RECEIPT_APPROVE)
  @ApiOperation({ summary: 'Duyệt phiếu' })
  @ApiOkResponse({ type: ReceiptDetailDto })
  approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReceiptDetailDto> {
    return this.receipts.approve(tenant.tenantId, user.id, id);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSION.RECEIPT_APPROVE)
  @ApiOperation({ summary: 'Huỷ phiếu' })
  @ApiOkResponse({ type: ReceiptDetailDto })
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelReceiptDto,
  ): Promise<ReceiptDetailDto> {
    return this.receipts.cancel(tenant.tenantId, user.id, id, dto.reason);
  }
}
