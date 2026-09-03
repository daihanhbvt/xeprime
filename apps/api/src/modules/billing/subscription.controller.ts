import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { BillingService } from './billing.service';
import {
  MySubscriptionDto,
  PurchaseSubscriptionDto,
  SubscriptionInvoiceDto,
  SubscriptionInvoicePageDto,
  SubscriptionListQueryDto,
  TenantPlanDto,
} from './dto/billing.dto';

/**
 * "Gói của tôi" — gian hàng tự xem gói/hạn mức/lượt miễn phí và TỰ MUA gói (W2, ADR 0015/0026).
 *
 * Mua ở đây = sinh hoá đơn `issued` + mã đối soát `XPG…`; gói CHỈ kích hoạt khi tiền đã về
 * (webhook SePay — W4) hoặc admin gán tay. Không có đường nào mở gói chưa trả tiền.
 */
@ApiTags('subscription')
@Controller('subscription')
@TenantScoped()
export class SubscriptionController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({ summary: 'Gói hiện hành + mức dùng chỗ theo loại xe + lượt miễn phí (ADR 0026)' })
  @ApiOkResponse({ type: MySubscriptionDto })
  mySubscription(@CurrentTenant() tenant: TenantContext): Promise<MySubscriptionDto> {
    return this.billing.mySubscription(tenant.tenantId);
  }

  @Get('plans')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({ summary: 'Danh sách gói đang bán để gian hàng chọn mua' })
  @ApiOkResponse({ type: [TenantPlanDto] })
  plans(): Promise<TenantPlanDto[]> {
    return this.billing.listPlansForTenant();
  }

  @Get('invoices')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({ summary: 'Lịch sử hoá đơn gói (mới nhất trước)' })
  @ApiOkResponse({ type: SubscriptionInvoicePageDto })
  invoices(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: SubscriptionListQueryDto,
  ): Promise<SubscriptionInvoicePageDto> {
    return this.billing.listInvoicesForTenant(
      tenant.tenantId,
      query,
    ) as Promise<SubscriptionInvoicePageDto>;
  }

  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.SUBSCRIPTION_PURCHASE)
  @ApiOperation({
    summary: 'Mua / gia hạn gói — sinh hoá đơn + mã đối soát, gói bật khi tiền về (ADR 0026 điều 4)',
  })
  @ApiOkResponse({ type: SubscriptionInvoiceDto })
  purchase(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseSubscriptionDto,
  ): Promise<SubscriptionInvoiceDto> {
    return this.billing.purchase(tenant.tenantId, user.id, dto);
  }
}
