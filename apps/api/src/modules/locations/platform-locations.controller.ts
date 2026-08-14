import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  CreateProvinceDto,
  PlatformProvinceDto,
  PlatformProvinceListDto,
  PlatformProvinceQueryDto,
  UpdateProvinceDto,
} from './dto/province.dto';
import { ProvincesService } from './provinces.service';

/**
 * Quản trị danh mục hành chính — nền tảng, không thuộc gian hàng nào.
 *
 * Không có endpoint XOÁ: một tỉnh đã được chi nhánh/xe tham chiếu mà biến mất thì dữ liệu lịch
 * sử mất chỗ dựa (FK `ON DELETE RESTRICT` cũng sẽ chặn). Cách đúng là tắt `isEnabled` (ngừng
 * nhận đăng ký mới) hoặc tắt `isPublicVisible` (ẩn khỏi marketplace) — dữ liệu đang có ở lại
 * nguyên vẹn.
 */
@ApiTags('platform-admin')
@Controller('platform/locations')
@PlatformOnly()
export class PlatformLocationsController {
  constructor(private readonly provinces: ProvincesService) {}

  @Get()
  @RequirePermissions(PERMISSION.PLATFORM_LOCATION_VIEW)
  @ApiOperation({
    summary: 'Toàn bộ danh mục tỉnh/thành kèm số chi nhánh, số xe và số xe đang công khai',
  })
  @ApiOkResponse({ type: PlatformProvinceListDto })
  async list(@Query() query: PlatformProvinceQueryDto): Promise<PlatformProvinceListDto> {
    return { items: await this.provinces.listForPlatform(query.q) };
  }

  @Post()
  @RequirePermissions(PERMISSION.PLATFORM_LOCATION_MANAGE)
  @ApiOperation({ summary: 'Thêm đơn vị hành chính cấp tỉnh mới (mã bất biến sau khi tạo)' })
  @ApiCreatedResponse({ type: PlatformProvinceDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProvinceDto,
  ): Promise<PlatformProvinceDto> {
    return this.provinces.create(user.id, dto);
  }

  @Patch(':code')
  @RequirePermissions(PERMISSION.PLATFORM_LOCATION_MANAGE)
  @ApiOperation({ summary: 'Đổi metadata hiển thị / bật-tắt chọn mới / ẩn-hiện công khai' })
  @ApiOkResponse({ type: PlatformProvinceDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: UpdateProvinceDto,
  ): Promise<PlatformProvinceDto> {
    return this.provinces.update(code, user.id, dto);
  }
}
