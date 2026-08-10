import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { BannersService } from './banners.service';
import { PublicBannerDto } from './dto/banner.dto';

/**
 * Banner hero trang chủ — công khai, không đăng nhập.
 *
 * Chỉ trả các trường cần render (ảnh/alt/link); tên nội bộ, lịch và metadata quản trị KHÔNG
 * bao giờ ra ngoài. Lọc active + khung lịch nằm ở service — client không tự quyết banner nào hiện.
 */
@ApiTags('public-banners')
@Controller('public/banners')
export class PublicBannersController {
  constructor(private readonly banners: BannersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tối đa 3 banner đang hiển thị cho hero trang chủ' })
  @ApiOkResponse({ type: [PublicBannerDto] })
  list(): Promise<PublicBannerDto[]> {
    return this.banners.publicList();
  }
}
