import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, WALLET_OWNER_TYPE_VALUES } from '@xeprime/types';
import { CurrentPlatform, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { PlatformContext } from '../../common/types/request-context';
import {
  PlatformWalletEntryPageDto,
  PlatformWalletEntryQueryDto,
  PlatformWalletSummaryDto,
} from './dto/platform-wallet.dto';
import { PlatformWalletReadService } from './platform-wallet-read.service';

/**
 * Ví điểm của một chủ ví (tài khoản khách / gian hàng) cho nhân sự nền tảng — CHỈ ĐỌC (đợt rà Admin
 * 16/11/2026). Không có thao tác ghi nào ở đây: sổ ví chỉ đổi qua `WalletService` trong transaction
 * của nghiệp vụ sinh ra nó (ADR 0033 điều 6).
 */
@ApiTags('platform-money')
@Controller('platform/wallets/:ownerType/:ownerId')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_WALLET_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformWalletsController {
  constructor(private readonly wallets: PlatformWalletReadService) {}

  @Get()
  @ApiParam({ name: 'ownerType', enum: WALLET_OWNER_TYPE_VALUES })
  @ApiParam({ name: 'ownerId', description: 'Id tài khoản khách hoặc gian hàng' })
  @ApiOperation({
    summary: 'Số dư Ví điểm của một chủ ví: khả dụng, đang rút, tổng sổ và cờ khớp sổ',
  })
  @ApiOkResponse({ type: PlatformWalletSummaryDto })
  summary(
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
  ): Promise<PlatformWalletSummaryDto> {
    return this.wallets.summary(ownerType, ownerId);
  }

  @Get('entries')
  @ApiParam({ name: 'ownerType', enum: WALLET_OWNER_TYPE_VALUES })
  @ApiParam({ name: 'ownerId', description: 'Id tài khoản khách hoặc gian hàng' })
  @ApiOperation({
    summary: 'Bút toán Ví điểm của một chủ ví (mới nhất trước, phân trang) kèm nguồn',
    description:
      'Nguồn: mã đơn, mã giữ chỗ, mã lệnh rút. Ngân hàng nhận của lệnh rút chỉ trả cho người có ' +
      '`platform.money.manage` (đã che số), người chỉ có `platform.wallets.view` nhận `null`.',
  })
  @ApiOkResponse({ type: PlatformWalletEntryPageDto })
  entries(
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
    @Query() query: PlatformWalletEntryQueryDto,
    @CurrentPlatform() platform: PlatformContext,
  ): Promise<PlatformWalletEntryPageDto> {
    return this.wallets.entries(
      ownerType,
      ownerId,
      query,
      platform.permissions.includes(PERMISSION.PLATFORM_MONEY_MANAGE),
    );
  }
}
