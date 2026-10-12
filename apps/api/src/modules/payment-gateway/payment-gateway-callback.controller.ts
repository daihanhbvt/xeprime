import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiExtension,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ACCOUNT_REALM_VALUES, API_ERROR_CODE } from '@xeprime/types';
import type { Response } from 'express';
import { Public, Realms } from '../../common/decorators';
import { VnpayIpnAckDto } from './dto/payment-gateway.dto';
import { PaymentGatewayService } from './payment-gateway.service';

/**
 * IPN của cổng thanh toán — endpoint CÔNG KHAI có quyền ghi tiền, cùng kỷ luật webhook SePay
 * (ADR 0016 điều 4 · ADR 0022 ràng buộc 1–6), tất cả đều TƯỜNG MINH:
 *
 *  - `@Public()`: cổng không có phiên. Cửa thật là CHỮ KÝ của cổng (HMAC bằng khoá chỉ server và cổng
 *    biết), kiểm ở adapter bằng so sánh thời gian hằng. Cổng chưa cấu hình ⇒ fail closed.
 *  - `@SkipThrottle()`: cổng gửi lại theo lịch của nó; chặn nó là tự trì hoãn tiền của chính mình.
 *  - KHÔNG `@TenantScoped()`: request không thuộc tenant nào — tenant suy từ LƯỢT THANH TOÁN đã ghi
 *    phía server, không bao giờ từ payload.
 *  - Trình duyệt quay về KHÔNG đi qua đây và không đổi được gì: chỉ IPN (và truy vấn do server gửi)
 *    mới ghi kết quả.
 */
@ApiTags('payment-gateway')
@Controller('payment-gateway')
// IPN công khai của cổng — không có phiên, không có realm.
@Realms(...ACCOUNT_REALM_VALUES)
export class PaymentGatewayCallbackController {
  constructor(private readonly gateway: PaymentGatewayService) {}

  /**
   * MoMo POST JSON và chờ HTTP 204 trong 15 giây (tài liệu Payment Notification). Sai chữ ký ⇒ 401,
   * không xác nhận; chưa cấu hình ⇒ 503 để MoMo gửi lại khi đã cấu hình.
   */
  @Post('momo/ipn')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'IPN MoMo — xác minh chữ ký, ghi kết quả, áp tiền vào hoá đơn/giữ chỗ' })
  @ApiNoContentResponse({ description: 'Đã nhận (kể cả khi đã nhận trước đó)' })
  async momoIpn(
    // `unknown` có chủ đích: pipe toàn cục `forbidNonWhitelisted` sẽ 400 mọi trường MoMo thêm sau
    // này (cùng bẫy webhook SePay) — adapter bóc tay đúng các trường cần.
    @Body() payload: unknown,
  ): Promise<void> {
    const outcome = await this.gateway.handleMomoIpn(payload);
    if (outcome === 'not_configured') {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.PAYMENT_GATEWAY_UNAVAILABLE,
        message: 'Cổng MoMo chưa được cấu hình',
      });
    }
    if (outcome === 'invalid') {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.PAYMENT_GATEWAY_SIGNATURE_INVALID,
        message: 'Sai chữ ký',
      });
    }
  }

  /**
   * VNPAY gọi GET kèm tham số `vnp_*` và đọc `{ RspCode, Message }` để quyết có gọi lại không
   * (tài liệu "Thanh toán PAY" — IPN). Luôn HTTP 200; mã nghiệp vụ nằm trong thân.
   */
  @Get('vnpay/ipn')
  @Public()
  @SkipThrottle()
  @ApiExtension('x-xeprime-raw-response', true)
  @ApiOperation({ summary: 'IPN VNPAY — xác minh chữ ký, ghi kết quả, trả RspCode theo tài liệu' })
  @ApiOkResponse({ type: VnpayIpnAckDto })
  async vnpayIpn(
    // `unknown`: tham số `vnp_*` của VNPAY không đi qua DTO (cùng lý do với MoMo ở trên).
    @Query() query: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const ack = await this.gateway.handleVnpayIpn(query);
    response.status(HttpStatus.OK).json(ack);
  }
}
