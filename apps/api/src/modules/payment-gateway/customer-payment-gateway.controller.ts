import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM, PAYMENT_ORDER_TARGET } from '@xeprime/types';
import type { Request } from 'express';
import { CurrentUser, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  PaymentGatewayMethodsDto,
  PaymentOrderDto,
  StartGatewayCheckoutDto,
} from './dto/payment-gateway.dto';
import { checkoutRequestFrom } from './payment-gateway-request';
import { PaymentGatewayService } from './payment-gateway.service';

/**
 * Tiền giữ chỗ qua cổng MoMo/VNPAY — phía KHÁCH (site `xeprime.vn`, realm `customer`).
 *
 * Không có permission: khách chỉ chạm được khoản giữ chỗ của CHÍNH chuyến mình, và quyền sở hữu nằm
 * trong câu truy vấn của service (`customerUserId` = người đang đăng nhập). Tài khoản đối tác/quản
 * trị không đặt xe nên không có ở đây (ADR 0053 điều 7).
 *
 * Mặc định TẮT (`PAYMENT_GATEWAY_BOOKING_HOLD`), và production từ chối boot nếu bật — release gate
 * L1/L5 (ADR 0058).
 */
@ApiTags('payment-gateway')
@Controller('account/payment-gateway')
@Realms(ACCOUNT_REALM.CUSTOMER)
export class CustomerPaymentGatewayController {
  constructor(private readonly gateway: PaymentGatewayService) {}

  @Get('methods')
  @ApiOperation({
    summary: 'Cổng thanh toán đang mở cho tiền giữ chỗ — rỗng khi chưa cấu hình hoặc chưa bật',
  })
  @ApiOkResponse({ type: PaymentGatewayMethodsDto })
  methods(): PaymentGatewayMethodsDto {
    return this.gateway.methods(PAYMENT_ORDER_TARGET.BOOKING_HOLD);
  }

  @Post('trips/:tripId/checkout')
  @HttpCode(HttpStatus.OK)
  // Mỗi lượt mở phiên có thể là một request sang cổng — chặn bấm dồn trước khi chạm cổng.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Mở phiên thanh toán tiền giữ chỗ qua cổng — số tiền và mã đọc từ DB; dùng lại phiên còn hạn',
  })
  @ApiOkResponse({ type: PaymentOrderDto })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: StartGatewayCheckoutDto,
    @Req() req: Request,
  ): Promise<PaymentOrderDto> {
    return this.gateway.startHoldCheckout(user.id, tripId, checkoutRequestFrom(req, dto, user.id));
  }

  @Get('orders/:orderId')
  @ApiOperation({
    summary:
      'Trạng thái MỘT lượt thanh toán qua cổng (trang quay về) — server tự hỏi cổng khi còn chờ quá lâu',
  })
  @ApiOkResponse({ type: PaymentOrderDto })
  order(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ): Promise<PaymentOrderDto> {
    return this.gateway.orderForCustomer(user.id, orderId);
  }
}
