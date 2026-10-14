import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { NO_STORE_CACHE_CONTROL } from '../../common/http-cache';
import { AppConfigService } from './app-config.service';
import { PartnerAppConfigDto } from './dto/app-config.dto';

/**
 * Cấu hình app Partner — kênh đọc công khai (`no-store`). Không realtime: app gọi lại endpoint này
 * mỗi lần màn dùng cờ được focus (docs/app-config.md).
 */
@ApiTags('app-config')
@Controller('app-config')
@Realms(ACCOUNT_REALM.PARTNER)
export class AppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get('partner')
  @Public()
  @Header('Cache-Control', NO_STORE_CACHE_CONTROL)
  @ApiOperation({ summary: 'Cấu hình app Partner (isPlanPromotionEnabled + version) — không cache, không cần đăng nhập' })
  @ApiOkResponse({ type: PartnerAppConfigDto })
  partner(): Promise<PartnerAppConfigDto> {
    return this.appConfig.getPartner();
  }
}
