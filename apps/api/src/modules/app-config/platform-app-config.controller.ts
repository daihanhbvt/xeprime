import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import { NO_STORE_CACHE_CONTROL } from '../../common/http-cache';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { AppConfigService } from './app-config.service';
import { PartnerAppConfigAdminDto, UpdatePartnerAppConfigDto } from './dto/app-config.dto';

/**
 * QUẢN TRỊ cấu hình app Partner — `@PlatformOnly()` + `platform.app_config.manage`.
 * PATCH ghi audit cùng transaction, tăng `version`. App Partner đọc lại `GET /app-config/partner` khi màn được focus.
 */
@ApiTags('platform-app-config')
@Controller('platform/app-config')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_APP_CONFIG_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformAppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get('partner')
  @Header('Cache-Control', NO_STORE_CACHE_CONTROL)
  @ApiOperation({ summary: 'Cấu hình app Partner (kèm hotline/Zalo in trong email)' })
  @ApiOkResponse({ type: PartnerAppConfigAdminDto })
  get(): Promise<PartnerAppConfigAdminDto> {
    return this.appConfig.getPartnerAdmin();
  }

  @Patch('partner')
  @ApiOperation({ summary: 'Đổi cấu hình app Partner — audit, version +1' })
  @ApiOkResponse({ type: PartnerAppConfigAdminDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePartnerAppConfigDto,
  ): Promise<PartnerAppConfigAdminDto> {
    return this.appConfig.updatePartner(user.id, dto);
  }
}
