import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES, PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { AppVersionDto, AppVersionParamsDto, AppVersionQueryDto } from './app-versions.dto';
import { AppVersionsService } from './app-versions.service';

/**
 * Thông báo cập nhật app native — công khai, không đọc phiên, cấu hình ở env
 * (docs/deployment.md §9 "Phiên bản app"). Rate limit theo throttler mặc định toàn cục.
 */
@ApiTags('app-versions')
@Controller('app-versions')
@Realms(...ACCOUNT_REALM_VALUES)
export class AppVersionsController {
  constructor(private readonly versions: AppVersionsService) {}

  @Get(':app')
  @Public()
  @PublicCache(PUBLIC_CACHE_SECONDS.appVersion)
  @ApiOperation({ summary: 'Phiên bản mới nhất / tối thiểu + link store của app native theo nền tảng' })
  @ApiOkResponse({ type: AppVersionDto })
  get(@Param() params: AppVersionParamsDto, @Query() query: AppVersionQueryDto): AppVersionDto {
    return this.versions.get(params.app, query.platform);
  }
}
