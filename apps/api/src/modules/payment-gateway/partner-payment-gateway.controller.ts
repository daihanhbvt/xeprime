import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM, PAYMENT_ORDER_TARGET, PERMISSION } from '@xeprime/types';
import type { Request } from 'express';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  PaymentGatewayMethodsDto,
  PaymentOrderDto,
  StartGatewayCheckoutDto,
} from './dto/payment-gateway.dto';
import { checkoutRequestFrom } from './payment-gateway-request';
import { PaymentGatewayService } from './payment-gateway.service';

/**
 * Hoá đơn gói qua cổng MoMo/VNPAY — phía ĐỐI TÁC (site partner, realm `partner`).
 *
 * Cùng quyền với mua gói (`subscription.purchase` để mở phiên, `subscription.view` để đọc): trả tiền
 * một hoá đơn là bước cuối của chính việc mua gói. Tenant đến từ membership (`@TenantScoped`), hoá
 * đơn tra trong phạm vi đó — hoá đơn của gian hàng khác không tồn tại với người gọi.
 *
 * Không `@SupportAction`: nhân sự nền tảng trong phiên hỗ trợ KHÔNG trả tiền hộ gian hàng.
 * Gói bật khi cổng xác nhận đã thu (IPN/truy vấn), không phải khi trình duyệt quay về.
 */
@ApiTags('payment-gateway')
@Controller('subscription/payment-gateway')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class PartnerPaymentGatewayController {
  constructor(private readonly gateway: PaymentGatewayService) {}

  @Get('methods')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({
    summary: 'Cổng thanh toán đang mở cho hoá đơn gói — rỗng khi chưa cấu hình hoặc chưa bật',
  })
  @ApiOkResponse({ type: PaymentGatewayMethodsDto })
  methods(): PaymentGatewayMethodsDto {
    return this.gateway.methods(PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE);
  }

  @Post('invoices/:invoiceId/checkout')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.SUBSCRIPTION_PURCHASE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Mở phiên thanh toán hoá đơn gói qua cổng — số tiền là phần còn thiếu đọc từ DB; dùng lại phiên còn hạn',
  })
  @ApiOkResponse({ type: PaymentOrderDto })
  checkout(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: StartGatewayCheckoutDto,
    @Req() req: Request,
  ): Promise<PaymentOrderDto> {
    return this.gateway.startInvoiceCheckout(
      tenant.tenantId,
      invoiceId,
      checkoutRequestFrom(req, dto, user.id),
    );
  }

  @Get('orders/:orderId')
  @RequirePermissions(PERMISSION.SUBSCRIPTION_VIEW)
  @ApiOperation({
    summary:
      'Trạng thái MỘT lượt thanh toán hoá đơn qua cổng (trang quay về) — server tự hỏi cổng khi còn chờ quá lâu',
  })
  @ApiOkResponse({ type: PaymentOrderDto })
  order(
    @CurrentTenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
  ): Promise<PaymentOrderDto> {
    return this.gateway.orderForTenant(tenant.tenantId, orderId);
  }
}
