import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WALLET_OWNER_TYPE } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  ShopOwnerOnly,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CreateWithdrawalDto,
  WalletEntryPageDto,
  WalletEntryQueryDto,
  WalletStatementDto,
  WalletStatementQueryDto,
  WalletSummaryDto,
  WithdrawalRequestDto,
} from './dto/wallet.dto';
import { WalletReadService } from './wallet-read.service';
import { WalletStatementService } from './wallet-statement.service';
import { WithdrawalService } from './withdrawal.service';

/**
 * "Ví điểm" của MỘT CON NGƯỜI — dành cho người CHƯA là chủ xe.
 *
 * Không gắn `@TenantScoped`: đây là tài sản của tài khoản cá nhân.
 *
 * ⚠️ Từ 15/09/2026, một chủ xe KHÔNG còn ví ở đây. Ví của họ đã đổi chủ sang tenant lúc mở gian
 * hàng (`WalletService.adoptUserWalletWithinTx`), và tiền hoàn khi chính họ đi thuê cũng chảy về
 * đó. Endpoint này vì vậy trả số 0 cho họ — đúng, vì sổ của họ nằm ở `/shop/wallet`. Bản trước
 * ghi "một chủ gian hàng có hai ví và chúng KHÔNG trộn"; đó chính là điều đợt này bỏ đi.
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
 * `tenant_id` từ membership qua `@TenantScoped`, không bao giờ từ body.
 *
 * `@ShopOwnerOnly()` là cổng THẬT (15/09/2026): CHỈ `shop_owner`. Trước đó nhóm này gác bằng
 * `seller_profile.view`/`.manage`, và `shop_manager` có `seller_profile.view` mặc định — nên quản
 * lý đọc được số dư, toàn bộ sổ cái và lịch sử rút.
 *
 * Cố ý KHÔNG kèm `@RequirePermissions`: thêm một khoá quyền vào đây sẽ gợi ý rằng cấp khoá đó là
 * đủ để mở ví, trong khi vai mới là thứ quyết định. Một cổng, một câu trả lời.
 */
@ApiTags('wallet')
@Controller('shop/wallet')
@TenantScoped()
@ShopOwnerOnly()
export class ShopWalletController {
  constructor(
    private readonly read: WalletReadService,
    private readonly statement: WalletStatementService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Số dư ví điểm của gian hàng' })
  @ApiOkResponse({ type: WalletSummaryDto })
  summary(@CurrentTenant() tenant: TenantContext): Promise<WalletSummaryDto> {
    return this.read.summary({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Get('entries')
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

  @Get('statement')
  @ApiOperation({
    summary: 'Bảng tổng hợp giao dịch của gian hàng trong một kỳ',
    description:
      'Chuyến hoàn thành trong kỳ (giờ Việt Nam) kèm doanh thu, thuế khấu trừ, phần khách trả ' +
      'trực tiếp khi nhận xe và số ví thật sự nhúc nhích. Cộng dồn tính trên CẢ KỲ, không theo ' +
      'trang đang xem. KHÔNG có dòng "phí sàn": phí dịch vụ XePrime do khách trả thêm và không ' +
      'trừ vào doanh thu gian hàng (ADR 0032 điều 2).',
  })
  @ApiOkResponse({ type: WalletStatementDto })
  tenantStatement(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: WalletStatementQueryDto,
  ): Promise<WalletStatementDto> {
    return this.statement.tenantStatement(
      tenant.tenantId,
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId },
      query,
    );
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Các yêu cầu rút của gian hàng' })
  @ApiOkResponse({ type: [WithdrawalRequestDto] })
  listWithdrawals(@CurrentTenant() tenant: TenantContext): Promise<WithdrawalRequestDto[]> {
    return this.withdrawals.list({ type: WALLET_OWNER_TYPE.TENANT, tenantId: tenant.tenantId });
  }

  @Post('withdrawals')
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
