import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { OkResultDto } from '../../common/dto/api-response.dto';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser, RequestContext } from '../../common/types/request-context';
import { OpenSupportContextDto, SupportContextDto } from './dto/tenant-support.dto';
import { TenantSupportService } from './tenant-support.service';

/**
 * Vòng đời phiên hỗ trợ gian hàng — ADR 0050. Endpoint NỀN TẢNG (`@PlatformOnly`), không dùng
 * chung guard với khu gian hàng.
 *
 * Mọi thao tác TRONG khu làm việc của gian hàng không đi qua đây: chúng gọi thẳng endpoint
 * tenant-scoped hiện có, kèm header `x-support-context`, và `TenantScopeGuard` xác minh phiên.
 */
@ApiTags('platform-tenant-support')
@Controller('platform/tenant-support/contexts')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW)
export class TenantSupportController {
  constructor(private readonly support: TenantSupportService) {}

  @Post()
  @ApiOperation({ summary: 'Mở phiên hỗ trợ cho một gian hàng (có lý do, hết hạn sau 45 phút)' })
  @ApiCreatedResponse({ type: SupportContextDto })
  open(
    @Req() req: RequestContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenSupportContextDto,
  ): Promise<SupportContextDto> {
    // PlatformScopeGuard đã nạp — thiếu là lỗi lắp guard, không phải lỗi của người gọi.
    if (!req.platform) throw new ForbiddenException({ code: API_ERROR_CODE.FORBIDDEN });
    return this.support.open(user, req.platform.permissions, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Đọc phiên hỗ trợ đang mở của chính mình (403 khi hết hạn/đã thoát)' })
  @ApiOkResponse({ type: SupportContextDto })
  get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupportContextDto> {
    return this.support.get(id, user);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Thoát phiên hỗ trợ (idempotent)' })
  @ApiOkResponse({ type: OkResultDto })
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OkResultDto> {
    await this.support.revoke(id, user);
    return { ok: true };
  }
}
