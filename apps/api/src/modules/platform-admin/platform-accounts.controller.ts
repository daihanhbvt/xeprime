import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import { AccountLookupItemDto, AccountLookupQueryDto } from './dto/platform-account-lookup.dto';
import { PlatformAccountLookupService } from './platform-account-lookup.service';

/**
 * Tra cứu một số điện thoại/email ra MỌI tài khoản trùng ở cả ba realm — ADR 0053 điều 9.
 * CHỈ ĐỌC, liên hệ đã che. Cùng quyền với màn tra cứu khách (`platform.customers.view`).
 */
@ApiTags('platform-customers')
@Controller('platform/accounts')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_CUSTOMER_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformAccountsController {
  constructor(private readonly lookup: PlatformAccountLookupService) {}

  @Get('lookup')
  @ApiOperation({
    summary: 'Tra cứu xuyên realm: mọi tài khoản trùng một SĐT/email, mỗi dòng ghi rõ realm',
  })
  @ApiOkResponse({ type: [AccountLookupItemDto] })
  find(@Query() query: AccountLookupQueryDto): Promise<AccountLookupItemDto[]> {
    return this.lookup.lookup(query);
  }
}
