import { Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExtension, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { SepayWebhookAckDto } from './dto/sepay.dto';
import { SepayService } from './sepay.service';

/**
 * SePay Test mode currently validates this acknowledgement as a raw response body. Keep the
 * whitespace stable instead of letting Express JSON serialization minify the object.
 */
const SEPAY_WEBHOOK_ACK_BODY = '{"success": true}';

/**
 * Webhook tiền vào từ SePay — endpoint CÔNG KHAI duy nhất có quyền ghi tiền (ADR 0022).
 *
 * Ba quyết định bảo vệ, đều TƯỜNG MINH chứ không phải quên gắn:
 *
 *  - `@Public()`: SePay không có session/cookie. Cửa thật là khoá `Authorization: Apikey …`
 *    so time-safe trong `SepayService.assertApiKey` — chưa cấu hình khoá thì 503 fail-closed.
 *  - `@SkipThrottle()`: SePay bắn dồn khi retry (ADR 0022 ràng buộc 4); throttler chặn nó là
 *    tự trì hoãn tiền của chính mình. Brute-force khoá đã bị chặn bởi so sánh time-safe + khoá
 *    ≥16 ký tự, không cần đếm request.
 *  - KHÔNG `@TenantScoped()`: request không thuộc tenant nào; tenant suy từ đích đã khớp.
 *
 * `@HttpCode(200)`: trùng giao dịch cũng 200 — 4xx/5xx làm SePay retry vĩnh viễn một thứ đã
 * nhận xong.
 */
@ApiTags('billing')
@Controller('sepay')
export class SepayController {
  constructor(private readonly sepay: SepayService) {}

  @Post('webhook')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @ApiExtension('x-xeprime-raw-response', true)
  @ApiOperation({ summary: 'Webhook SePay — ghi giao dịch tiền vào và khớp hoá đơn gói' })
  @ApiOkResponse({ type: SepayWebhookAckDto })
  async webhook(
    @Headers('authorization') authorization: string | undefined,
    // `unknown` có chủ đích: DTO + pipe `forbidNonWhitelisted` sẽ 400 mọi trường mới SePay
    // thêm vào — cùng bẫy đã ghi ở `bootstrap.ts` cho OAuth callback. Bóc tay trong service.
    @Body() payload: unknown,
    @Res() response: Response,
  ): Promise<void> {
    this.sepay.assertApiKey(authorization);
    await this.sepay.ingest(payload);

    response.status(200).type('application/json').send(SEPAY_WEBHOOK_ACK_BODY);
  }
}
