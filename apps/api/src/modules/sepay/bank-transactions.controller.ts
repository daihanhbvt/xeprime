import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BankTransactionsService } from './bank-transactions.service';
import {
  BankTransactionDetailDto,
  BankTransactionListQueryDto,
  BankTransactionPageDto,
  IgnoreBankTransactionDto,
  MatchBankTransactionDto,
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
export class BankTransactionsController {
  constructor(private readonly transactions: BankTransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi giao dịch tiền vào — mặc định chỉ những khoản CHƯA KHỚP',
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
    summary: 'Khớp TAY vào một hoá đơn gói — cùng đường tiền với webhook, kèm audit và ghi chú',
  })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  match(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MatchBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    return this.transactions.match(id, user.id, dto);
  }

  @Post(':id/ignore')
  @ApiOperation({ summary: 'Bỏ qua một giao dịch không thuộc luồng nào — giữ dòng, ghi lý do' })
  @ApiOkResponse({ type: BankTransactionDetailDto })
  ignore(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IgnoreBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    return this.transactions.ignore(id, user.id, dto);
  }
}
