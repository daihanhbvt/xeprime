import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PublicQuoteDto, PublicQuoteQueryDto } from './dto/pricing.dto';
import { PricingService } from './pricing.service';

/**
 * Báo giá công khai cho khách trước khi gửi yêu cầu thuê — CÙNG PricingService với luồng duyệt
 * của shop (một nguồn tính giá, không nhân đôi công thức ở FE). Chỉ trả cho xe đã duyệt của
 * shop đang hoạt động; chưa gồm phí giao nhận (phụ thuộc khoảng cách — trả kèm bảng bậc để
 * khách tự ước lượng).
 */
@ApiTags('public-listings')
@Controller('public/listings')
export class PublicQuoteController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Get(':id/quote')
  @ApiOperation({
    summary: 'Báo giá thuê — theo khoảng ngày, hoặc theo GÓI tháng lịch với thuê dài hạn',
  })
  @ApiOkResponse({ type: PublicQuoteDto })
  quote(@Param('id') id: string, @Query() query: PublicQuoteQueryDto): Promise<PublicQuoteDto> {
    return this.pricing.publicQuote(id, query);
  }
}
