import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ApproveDriverLicenceDto,
  DriverLicenceImageDto,
  PlatformDriverLicenceCountsDto,
  PlatformDriverLicenceDto,
  PlatformDriverLicenceListQueryDto,
  PlatformDriverLicencePageDto,
  RejectDriverLicenceDto,
} from './dto/driver-licence.dto';
import { DriverLicencesService } from './driver-licences.service';

/**
 * Hàng đợi bằng lái của khách — những lượt máy không tự quyết được (ADR 0057 điều 3).
 *
 * **Danh sách che SĐT/email chủ tài khoản; chi tiết mở đủ.** Ảnh bằng lái là một request RIÊNG,
 * mỗi lần mở một dòng audit — hàng đợi mở suốt ngày không phải là cách xem ảnh hàng loạt.
 */
@ApiTags('platform-driver-licences')
@Controller('platform/driver-licences')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_DRIVER_LICENCE_REVIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformDriverLicencesController {
  constructor(private readonly licences: DriverLicencesService) {}

  @Get()
  @ApiOperation({ summary: 'Hàng đợi bằng lái — mặc định CHỜ DUYỆT, cũ nhất trước' })
  @ApiOkResponse({ type: PlatformDriverLicencePageDto })
  list(@Query() query: PlatformDriverLicenceListQueryDto): Promise<PlatformDriverLicencePageDto> {
    return this.licences.listForPlatform(query) as Promise<PlatformDriverLicencePageDto>;
  }

  @Get('counts')
  @ApiOperation({ summary: 'Đếm theo trạng thái — cho tab và huy hiệu menu' })
  @ApiOkResponse({ type: PlatformDriverLicenceCountsDto })
  counts(): Promise<PlatformDriverLicenceCountsDto> {
    return this.licences.countsForPlatform();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một lượt nộp — kèm liên hệ đầy đủ của chủ tài khoản' })
  @ApiOkResponse({ type: PlatformDriverLicenceDto })
  getOne(@Param('id') id: string): Promise<PlatformDriverLicenceDto> {
    return this.licences.getForPlatform(id);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Mở ảnh bằng lái — URL sống ngắn, ghi audit mỗi lần mở' })
  @ApiOkResponse({ type: DriverLicenceImageDto })
  image(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverLicenceImageDto> {
    return this.licences.imageForPlatform(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác thực bằng lái — với thông tin đã đối chiếu',
    description:
      'Bằng đang dùng trước đó (nếu có) chuyển `superseded`. Với GPLX VN / IDP, "lái được ô tô / ' +
      'xe máy" suy từ hạng; chỉ bằng nước ngoài dùng hai cờ gửi lên.',
  })
  @ApiOkResponse({ type: PlatformDriverLicenceDto })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApproveDriverLicenceDto,
  ): Promise<PlatformDriverLicenceDto> {
    return this.licences.approve(id, user.id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối — khách thấy lý do và nộp ảnh khác' })
  @ApiOkResponse({ type: PlatformDriverLicenceDto })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectDriverLicenceDto,
  ): Promise<PlatformDriverLicenceDto> {
    return this.licences.reject(id, user.id, dto);
  }
}
