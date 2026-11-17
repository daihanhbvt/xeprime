import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  PERMISSION,
} from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BankTransactionsService } from './bank-transactions.service';
import {
  BankTransactionDetailDto,
  BankTransactionListQueryDto,
  BankTransactionPageDto,
  CreditCustomerDto,
  IgnoreBankTransactionDto,
  MatchBankTransactionDto,
  MatchReceivableDto,
} from './dto/bank-transaction.dto';

/**
 * Hàng đợi đối soát tiền vào của admin nền tảng (ADR 0022 điều 4).
 *
 * `@PlatformOnly` + `platform.billing.manage` — cùng quyền với quản trị gói, và `finance_admin`
 * đã có sẵn nó. KHÔNG tenant-scoped: sổ ngân hàng là của nền tảng, một giao dịch chưa khớp thì
 * còn chưa biết thuộc gian hàng nào.
 *
 * Nằm trong module `sepay` cùng webhook vì mọi thứ đụng vào `bank_transactions` phải ở một chỗ
 * (writer duy nhất — ADR 0022 điều 2), dù đây là bề mặt quản trị chứ không phải bề mặt công khai.
 */
@ApiTags('billing')
@Controller('platform/bank-transactions')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BILLING_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class BankTransactionsController {
  constructor(private readonly transactions: BankTransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi giao dịch tiền vào - mặc định chỉ những khoản CHƯA KHỚP',
  })
  @ApiOkResponse({ type: BankTransactionPageDto })
  list(@Query() query: BankTransactionListQueryDto): Promise<BankTransactionPageDto> {
    return this.transactions.list(query) as Promise<BankTransactionPageDto>;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết một giao dịch: payload gốc + hoá đơn gợi ý để khớp tay',
  })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  getOne(@Param('id') id: string): Promise<BankTransactionDetailDto> {
    return this.transactions.getOne(id);
  }

  @Post(':id/match')
  @ApiOperation({
    summary: 'Khớp TAY vào một hoá đơn gói - cùng đường tiền với webhook, kèm audit và ghi chú',
  })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  match(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MatchBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    return this.transactions.match(id, user.id, dto);
  }

  /*
   * Hai lượt dưới đụng TIỀN MARKETPLACE (tiền giữ chỗ của khách, Ví điểm) chứ không chỉ tiền gói,
   * nên đòi thêm `platform.money.manage` — `RequirePermissions` ở handler GHI ĐÈ cấp class, nên
   * liệt kê lại quyền gói.
   */
  @Post(':id/match-receivable')
  @RequirePermissions(PERMISSION.PLATFORM_BILLING_MANAGE, PERMISSION.PLATFORM_MONEY_MANAGE)
  @ApiOperation({
    summary:
      'Khớp TAY vào một khoản giữ chỗ (XPH) / phụ lục (XPE) CÒN NHẬN TIỀN - cùng đường tiền với webhook (ADR 0092)',
    description:
      'Khoản đã đóng ⇒ 409 `BANK_TX_TARGET_CLOSED`: không bao giờ tạo đơn từ khoản đã đóng ' +
      '(ADR 0044 điều 7) - dùng `credit-customer`.',
  })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  matchReceivable(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MatchReceivableDto,
  ): Promise<BankTransactionDetailDto> {
    return this.transactions.matchReceivable(id, user.id, dto);
  }

  @Post(':id/credit-customer')
  @RequirePermissions(PERMISSION.PLATFORM_BILLING_MANAGE, PERMISSION.PLATFORM_MONEY_MANAGE)
  @ApiOperation({
    summary: 'Ghi có Ví điểm khách cho tiền về SAU khi khoản giữ chỗ / phụ lục đã đóng (ADR 0092)',
    description:
      'Khoản còn nhận tiền ⇒ 409 `BANK_TX_TARGET_STILL_OPEN` (phải khớp vào nó). Không có tài ' +
      'khoản khách ⇒ 409 `BANK_TX_NO_CUSTOMER_ACCOUNT` (chuyển trả tay rồi "Bỏ qua" kèm mã hoàn).',
  })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  creditCustomer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreditCustomerDto,
  ): Promise<BankTransactionDetailDto> {
    return this.transactions.creditCustomer(id, user.id, dto);
  }

  @Post(':id/ignore')
  @ApiOperation({ summary: 'Bỏ qua một giao dịch không thuộc luồng nào - giữ dòng, ghi lý do' })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  ignore(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IgnoreBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    return this.transactions.ignore(id, user.id, dto);
  }
}
