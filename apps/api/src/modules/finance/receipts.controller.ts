import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CancelReceiptDto,
  CreateReceiptDto,
  ReceiptDetailDto,
  ReceiptListQueryDto,
  ReceiptPageDto,
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
