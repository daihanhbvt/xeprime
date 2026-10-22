import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  DriverLicenceImageDto,
  PlatformDriverLicenceDto,
  PlatformDriverLicenceListQueryDto,
  PlatformDriverLicencePageDto,
} from './dto/driver-licence.dto';
import { DriverLicencesService } from './driver-licences.service';

/**
 * Bằng lái của khách trong HỒ SƠ KHÁCH THUÊ — chỉ đọc (ADR 0070 gỡ hàng đợi duyệt tay của ADR
 * 0057 điều 3; mọi lượt nộp do hệ thống tự quyết).
 *
 * **Liên hệ chủ tài khoản vẫn che.** Ảnh bằng lái là một request RIÊNG, mỗi lần mở một dòng audit.
 */
@ApiTags('platform-driver-licences')
@Controller('platform/driver-licences')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_DRIVER_LICENCE_REVIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformDriverLicencesController {
  constructor(private readonly licences: DriverLicencesService) {}

  @Get()
  @ApiOperation({ summary: 'Lịch sử nộp bằng lái của một khách — mới nhất trước' })
  @ApiOkResponse({ type: PlatformDriverLicencePageDto })
  list(@Query() query: PlatformDriverLicenceListQueryDto): Promise<PlatformDriverLicencePageDto> {
    return this.licences.listForPlatform(query) as Promise<PlatformDriverLicencePageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một lượt nộp' })
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
}
