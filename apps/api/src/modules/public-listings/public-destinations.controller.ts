import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PublicListingsService } from './public-listings.service';
import { PublicDestinationDto, PublicDestinationQueryDto } from './dto/public-listing.dto';

/**
 * "Địa điểm nổi bật" của trang chủ — công khai (@Public), chỉ đọc.
 *
 * Controller riêng thay vì gắn vào `public/listings` để không rơi vào route `GET /public/listings/:id`
 * (Nest khớp theo thứ tự khai báo — tách đường dẫn là cách an toàn, không phụ thuộc thứ tự).
 */
@ApiTags('public-listings')
@Controller('public/destinations')
export class PublicDestinationsController {
  constructor(private readonly listings: PublicListingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tỉnh/thành đang có xe cho thuê, kèm số xe và ảnh đại diện' })
  @ApiOkResponse({ type: [PublicDestinationDto] })
  list(@Query() query: PublicDestinationQueryDto): Promise<PublicDestinationDto[]> {
    return this.listings.listDestinations(query);
  }
}
