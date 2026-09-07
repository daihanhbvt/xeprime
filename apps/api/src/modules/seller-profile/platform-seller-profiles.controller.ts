import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  PlatformSellerListQueryDto,
  PlatformSellerProfileDto,
  PlatformSellerProfilePageDto,
  ReviewSellerProfileDto,
} from './dto/seller-profile.dto';
import { SellerProfileService } from './seller-profile.service';

/**
 * Xác minh người bán — hàng đợi của reviewer/finance_admin (R3, ADR 0028 release gate 1).
 *
 * **Danh sách CHE số giấy tờ và số tài khoản; chi tiết mở đủ.** Một hàng đợi mở suốt ngày không
 * nên phơi CCCD của hàng trăm người ra màn hình; lúc thật sự đối chiếu giấy tờ thì mở một hồ sơ,
 * và lượt mở đó là một request riêng có thể truy được trong log.
 */
@ApiTags('platform-sellers')
@Controller('platform/seller-profiles')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_SELLER_VERIFY)
export class PlatformSellerProfilesController {
  constructor(private readonly profiles: SellerProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Hàng đợi hồ sơ — mặc định CHỜ XÁC MINH, cũ nhất trước. PII đã che.' })
  @ApiOkResponse({ type: PlatformSellerProfilePageDto })
  list(@Query() query: PlatformSellerListQueryDto): Promise<PlatformSellerProfilePageDto> {
    return this.profiles.listForPlatform(query) as Promise<PlatformSellerProfilePageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một hồ sơ — PII đầy đủ để đối chiếu giấy tờ' })
  @ApiOkResponse({ type: PlatformSellerProfileDto })
  getOne(@Param('id') id: string): Promise<PlatformSellerProfileDto> {
    return this.profiles.getForPlatform(id);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác minh đạt' })
  @ApiOkResponse({ type: PlatformSellerProfileDto })
  verify(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformSellerProfileDto> {
    return this.profiles.verify(id, user.id);
  }

  @Post(':id/request-changes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu bổ sung — người bán sửa rồi gửi lại' })
  @ApiOkResponse({ type: PlatformSellerProfileDto })
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewSellerProfileDto,
  ): Promise<PlatformSellerProfileDto> {
    return this.profiles.requestChanges(id, user.id, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối hồ sơ' })
  @ApiOkResponse({ type: PlatformSellerProfileDto })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewSellerProfileDto,
  ): Promise<PlatformSellerProfileDto> {
    return this.profiles.reject(id, user.id, dto.note);
  }
}
