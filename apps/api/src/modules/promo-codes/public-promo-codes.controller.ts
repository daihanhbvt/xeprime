import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { resolveOptionalUserId } from '../../common/optional-user';
import { PrismaService } from '../../prisma/prisma.service';
import { NativeSessionService } from '../auth/native-session.service';
import { SessionService } from '../auth/session.service';
import {
  AvailablePromoQueryDto,
  PreviewPromoCodeDto,
  PromoPreviewDto,
  PromoPreviewListDto,
} from './dto/promo-code.dto';
import { PromoQuoteService } from './promo-quote.service';

/**
 * XEM TRƯỚC mã khuyến mãi cho khách thuê — ADR 0046 điều 7, cửa kiểm thứ nhất.
 *
 * ## Vì sao công khai
 *
 * Khách xem giá và áp mã TRƯỚC khi đăng nhập (luồng đặt xe cho phép khách vãng lai — họ chỉ
 * xác thực SĐT ở bước gửi). Một endpoint đòi phiên ở đây sẽ buộc mọi người đăng nhập chỉ để
 * biết mã có dùng được không.
 *
 * ## Không lộ gì về khách, và không cho dò mã
 *
 * Hai luật, cả hai ở tầng thiết kế chứ không ở một câu `if`:
 *
 *  - **Danh tính đến từ COOKIE/BEARER, không từ payload.** DTO không có ô SĐT, nên không có
 *    cách nào hỏi "số này đã từng thuê xe chưa". Khách chưa đăng nhập mà áp một mã có điều kiện
 *    theo người thì nhận `REQUIRES_IDENTITY` — một câu trả lời không nói gì về ai.
 *  - **Rate limit siết hơn mức chung của app.** Mã khuyến mãi là một không gian tên ngắn
 *    (`BANMOI`, `VAOTHU`…) nên nó dò được bằng từ điển. Con số dưới đây là trần cứng cho việc
 *    đó; nó không thay thế việc mã chỉ có giá trị khi khách thật sự đi thuê xe, nhưng nó làm
 *    một vòng lặp dò mã thành vô nghĩa về chi phí.
 *
 * Lý do KHÔNG áp thêm khoá theo tài khoản: người dò mã không cần tài khoản, và siết theo tài
 * khoản sẽ phạt đúng người đang đăng nhập thật.
 */
@ApiTags('public-promo-codes')
@Controller('public/promo-codes')
export class PublicPromoCodesController {
  constructor(
    private readonly promos: PromoQuoteService,
    private readonly sessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * `POST` chứ không `GET` cho một lượt ĐỌC: tham số là cả một chuyến (xe, khoảng thời gian,
   * dịch vụ, lộ trình, lựa chọn bảo hiểm), và mã khuyến mãi không nên nằm trên URL — nó đi vào
   * log truy cập, lịch sử trình duyệt và referer. `@HttpCode(200)` để nó không trả 201.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xem trước một mã khuyến mãi cho chuyến đang chọn — KHÔNG giữ lượt sử dụng',
  })
  @ApiOkResponse({ type: PromoPreviewDto })
  async preview(@Body() dto: PreviewPromoCodeDto, @Req() req: Request): Promise<PromoPreviewDto> {
    return this.promos.preview(dto, await this.userId(req));
  }

  /**
   * Danh sách mã đã công bố cho chuyến này, kèm lý do với từng mã không dùng được.
   *
   * `GET` để TanStack Query cache được: nó không mang mã nào trong tham số, và kết quả đọc lại
   * mỗi lần khách mở hộp thoại chọn mã.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('available')
  @ApiOperation({ summary: 'Mã khuyến mãi khả dụng cho chuyến đang chọn (kèm lý do nếu không áp được)' })
  @ApiOkResponse({ type: PromoPreviewListDto })
  async available(
    @Query() query: AvailablePromoQueryDto,
    @Req() req: Request,
  ): Promise<PromoPreviewListDto> {
    return { data: await this.promos.available(query, await this.userId(req)) };
  }

  /** Danh tính NẾU có phiên — `null` với khách chưa đăng nhập, không phải một lỗi. */
  private userId(req: Request): Promise<string | null> {
    return resolveOptionalUserId(req, this.sessions, this.prisma, this.nativeSessions);
  }
}
