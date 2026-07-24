import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { BookingRequestReceiptDto, CreateBookingRequestDto } from './dto/booking-request.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Gửi yêu cầu thuê từ Marketplace — công khai (@Public), không cần đăng nhập.
 *
 * KHÔNG nhận `tenant_id`: server suy từ xe (chỉ xe đã duyệt của shop đang hoạt động). Rate
 * limit toàn cục (ThrottlerGuard) chặn spam. Không giữ chỗ lịch — mới là yêu cầu.
 */
@ApiTags('public-booking-requests')
@Controller('public/booking-requests')
export class PublicBookingRequestsController {
  constructor(private readonly requests: BookingRequestsService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Khách gửi yêu cầu thuê một xe trên Marketplace' })
  @ApiCreatedResponse({ type: BookingRequestReceiptDto })
  submit(@Body() dto: CreateBookingRequestDto): Promise<BookingRequestReceiptDto> {
    return this.requests.submitPublic(dto);
  }
}
