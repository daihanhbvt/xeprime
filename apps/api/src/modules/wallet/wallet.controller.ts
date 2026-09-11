import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, WALLET_OWNER_TYPE } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CreateWithdrawalDto,
  WalletEntryPageDto,
  WalletEntryQueryDto,
  WalletSummaryDto,
  WithdrawalRequestDto,
} from './dto/wallet.dto';
import { WalletReadService } from './wallet-read.service';
import { WithdrawalService } from './withdrawal.service';

/**
 * "Ví điểm" của MỘT CON NGƯỜI — khách nhận tiền hoàn, chủ xe cơ bản nhận khoản XePrime phải trả.
 *
 * Không gắn `@TenantScoped`: đây là tài sản của tài khoản cá nhân. Một chủ gian hàng có hai ví
 * và chúng KHÔNG trộn — tiền hoàn chuyến của họ với tư cách khách không đi chung đường với tiền
 * của gian hàng.
 *
 * Không gắn `@RequiresFeature`: số dư là tiền của chính họ. Gói hết hạn vẫn phải xem và rút được
 * (ADR 0027 điều 3 — hết hạn là `read_only`, không phải `hidden`; và tiền thì không thuộc về gói).
 */
@ApiTags('wallet')
@Controller('account/wallet')
export class AccountWalletController {
  constructor(
    private readonly read: WalletReadService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Số dư ví điểm của tôi',
    description:
      'Ba con số: rút được ngay, đang chờ chuyển, và tổng XePrime phải trả. Kèm cam kết thời ' +
      'gian để màn hình nói được điều đó TRƯỚC khi người dùng bấm rút.',
  })
  @ApiOkResponse({ type: WalletSummaryDto })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<WalletSummaryDto> {
    return this.read.summary({ type: WALLET_OWNER_TYPE.USER, userId: user.id });
  }

  @Get('entries')
  @ApiOperation({ summary: 'Sổ ví — phân trang server-side, mới nhất trước' })
  @ApiOkResponse({ type: WalletEntryPageDto })
  entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WalletEntryQueryDto,
  ): Promise<WalletEntryPageDto> {
    return this.read.entries({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, query);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Các yêu cầu rút của tôi' })
  @ApiOkResponse({ type: [WithdrawalRequestDto] })
  listWithdrawals(@CurrentUser() user: AuthenticatedUser): Promise<WithdrawalRequestDto[]> {
    return this.withdrawals.list({ type: WALLET_OWNER_TYPE.USER, userId: user.id });
  }

  @Post('withdrawals')
  @ApiOperation({
    summary: 'Tạo yêu cầu rút về tài khoản ngân hàng',
    description:
      'Đích chuyển phải là một tài khoản ĐÃ LƯU của chính chủ ví — không gõ số tài khoản ngay ' +
      'tại bước chi tiền. Tiền bị khoá khỏi số dư khả dụng ngay khi tạo.',
  })
  @ApiOkResponse({ type: WithdrawalRequestDto })
  createWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<WithdrawalRequestDto> {
    return this.withdrawals.create(
      { type: WALLET_OWNER_TYPE.USER, userId: user.id },
      user.id,
      dto,
    );
  }

  @Post('withdrawals/:id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Tự huỷ yêu cầu rút',
    description: 'Chỉ khi còn chờ duyệt. Đã duyệt rồi thì admin có thể đang cầm lệnh chuyển.',
  })
  @ApiNoContentResponse()
  cancelWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.withdrawals.cancel({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, id, user.id);
  }
}

/**
 * "Ví điểm" của GIAN HÀNG — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2).
 *
 * `tenant_id` từ membership qua `@TenantScoped`, không bao giờ từ body. Quyền dùng chung với hồ
 * sơ người bán: rút tiền của gian hàng là quyết định tiền của chủ, không phải việc của nhân viên
 * trực đơn.
 */
@ApiTags('wallet')
@Controller('shop/wallet')
@TenantScoped()
export class ShopWalletController {
  constructor(
    private readonly read: WalletReadService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION.SELLER_PROFILE_VIEW)
  @ApiOperation({ summary: 'Số dư ví điểm của gian hàng' })
  @ApiOkResponse({ type: WalletSummaryDto })
  summary(@CurrentTenant() tenant: TenantContext): Promise<WalletSummaryDto> {
    return this.read.summary({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Get('entries')
  @RequirePermissions(PERMISSION.SELLER_PROFILE_VIEW)
  @ApiOperation({ summary: 'Sổ ví của gian hàng' })
  @ApiOkResponse({ type: WalletEntryPageDto })
  entries(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: WalletEntryQueryDto,
  ): Promise<WalletEntryPageDto> {
    return this.read.entries(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      query,
    );
  }

  @Get('withdrawals')
  @RequirePermissions(PERMISSION.SELLER_PROFILE_VIEW)
  @ApiOperation({ summary: 'Các yêu cầu rút của gian hàng' })
  @ApiOkResponse({ type: [WithdrawalRequestDto] })
  listWithdrawals(@CurrentTenant() tenant: TenantContext): Promise<WithdrawalRequestDto[]> {
    return this.withdrawals.list({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Post('withdrawals')
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @ApiOperation({ summary: 'Gian hàng tạo yêu cầu rút' })
  @ApiOkResponse({ type: WithdrawalRequestDto })
  createWithdrawal(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<WithdrawalRequestDto> {
    return this.withdrawals.create(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      user.id,
      dto,
    );
  }

  @Post('withdrawals/:id/cancel')
  @RequirePermissions(PERMISSION.SELLER_PROFILE_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gian hàng tự huỷ yêu cầu rút' })
  @ApiNoContentResponse()
  cancelWithdrawal(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.withdrawals.cancel(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      id,
      user.id,
    );
  }
}
