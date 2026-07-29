import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { resolveOptionalUserId } from '../../common/optional-user';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { BookingRequestReceiptDto, CreateBookingRequestDto } from './dto/booking-request.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Gửi yêu cầu thuê từ Marketplace — công khai (@Public), không cần đăng nhập.
 *
 * KHÔNG nhận `tenant_id`: server suy từ xe (chỉ xe đã duyệt của shop đang hoạt động). Rate
 * limit toàn cục (ThrottlerGuard) chặn spam. Không giữ chỗ lịch — mới là yêu cầu.
 *
 * Best-effort: nếu khách ĐANG đăng nhập (có session cookie hợp lệ) thì gắn yêu cầu vào tài
 * khoản để sau này nhận thông báo duyệt/từ chối và đánh giá chuyến — nhưng vẫn cho khách vãng
 * lai gửi bình thường.
 */
@ApiTags('public-booking-requests')
@Controller('public/booking-requests')
export class PublicBookingRequestsController {
  constructor(
    private readonly requests: BookingRequestsService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Khách gửi yêu cầu thuê một xe trên Marketplace' })
  @ApiCreatedResponse({ type: BookingRequestReceiptDto })
  async submit(
    @Body() dto: CreateBookingRequestDto,
    @Req() req: Request,
  ): Promise<BookingRequestReceiptDto> {
    const customerUserId = await resolveOptionalUserId(req, this.sessions, this.prisma);
    return this.requests.submitPublic(dto, customerUserId);
  }
}
