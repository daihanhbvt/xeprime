import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
  SupportAction,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { BillingService } from './billing.service';
import {
  MySubscriptionDto,
  PaymentInfoDto,
  PendingSubscriptionInvoiceDto,
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
  @SupportAction(SUPPORT_CAPABILITY.SUBSCRIPTION_STATUS_VIEW)
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

  @Get('payment-info')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({
    summary: 'Thông tin nhận chuyển khoản của nền tảng — web dựng VietQR từ đây (ADR 0016 điều 5)',
  })
  @ApiOkResponse({ type: PaymentInfoDto })
  paymentInfo(): PaymentInfoDto {
    return this.billing.paymentInfo();
  }

  @Get('invoices')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.SUBSCRIPTION_STATUS_VIEW)
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

  /**
   * HOÁ ĐƠN ĐANG CHỜ TIỀN — `data: null` khi không có.
   *
   * Tồn tại vì màn onboarding gian hàng phải PHỤC HỒI sau một lần F5: người dùng tạo hoá đơn,
   * đóng trình duyệt, đăng nhập lại và phải thấy lại đúng mã + đúng QR đó thay vì một form mua
   * gói mời họ tạo mã thứ hai. Trang "Gói của tôi" dùng cùng endpoint cho dải QR ở đầu trang.
   *
   * `subscription.view` chứ không `subscription.purchase`: đây là đường ĐỌC, và quản lý cần biết
   * gian hàng đang nợ khoản nào.
   */
  @Get('invoices/pending')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({
    summary: 'Hoá đơn gói đang chờ tiền (issued | partially_paid); `invoice: null` nếu không có',
  })
  @ApiOkResponse({ type: PendingSubscriptionInvoiceDto })
  pendingInvoice(@CurrentTenant() tenant: TenantContext): Promise<PendingSubscriptionInvoiceDto> {
    return this.billing.pendingInvoiceForTenant(tenant.tenantId);
  }

  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.SUBSCRIPTION_PURCHASE)
  @ApiOperation({
    summary:
      'Mua / gia hạn gói — sinh hoá đơn + mã đối soát, gói bật khi tiền về (ADR 0026 điều 4)',
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
