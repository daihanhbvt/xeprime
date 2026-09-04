import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { SepayWebhookResultDto } from './dto/sepay.dto';
import { SepayService } from './sepay.service';

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
  @ApiOperation({ summary: 'Webhook SePay — ghi giao dịch tiền vào và khớp hoá đơn gói' })
  @ApiOkResponse({ type: SepayWebhookResultDto })
  webhook(
    @Headers('authorization') authorization: string | undefined,
    // `unknown` có chủ đích: DTO + pipe `forbidNonWhitelisted` sẽ 400 mọi trường mới SePay
    // thêm vào — cùng bẫy đã ghi ở `bootstrap.ts` cho OAuth callback. Bóc tay trong service.
    @Body() payload: unknown,
  ): Promise<SepayWebhookResultDto> {
    this.sepay.assertApiKey(authorization);
    return this.sepay.ingest(payload);
  }
}
