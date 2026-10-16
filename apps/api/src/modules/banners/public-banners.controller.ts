import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES, PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { BannersService } from './banners.service';
import { BannerPlacementQueryDto, PublicBannerDto } from './dto/banner.dto';

/**
 * Banner trang chủ (dải đầu trang + banner khuyến mãi) — công khai, không đăng nhập.
 *
 * Chỉ trả các trường cần render (ảnh/alt/link); tên nội bộ, lịch và metadata quản trị KHÔNG
 * bao giờ ra ngoài. Lọc active + khung lịch nằm ở service — client không tự quyết banner nào hiện.
 */
@ApiTags('public-banners')
@Controller('public/banners')
@Realms(...ACCOUNT_REALM_VALUES)
export class PublicBannersController {
  constructor(private readonly banners: BannersService) {}

  @Public()
  @Get()
  @PublicCache(PUBLIC_CACHE_SECONDS.banner)
  @ApiOperation({
    summary:
      'Toàn bộ banner đang hiển thị của một vị trí trang chủ (mặc định dải banner đầu trang)',
  })
  @ApiOkResponse({ type: [PublicBannerDto] })
  list(@Query() query: BannerPlacementQueryDto): Promise<PublicBannerDto[]> {
    return this.banners.publicList(query.placement);
  }
}
