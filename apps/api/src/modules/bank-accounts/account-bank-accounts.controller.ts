import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WALLET_OWNER_TYPE } from '@xeprime/types';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountDto, SaveBankAccountDto } from './dto/bank-account.dto';

/**
 * Tài khoản nhận tiền của MỘT CON NGƯỜI — khách được hoàn tiền, và chủ xe cơ bản nhận khoản
 * XePrime phải trả (ADR 0033).
 *
 * Không gắn `@TenantScoped`: đây là tài sản của tài khoản cá nhân, không của gian hàng. Một chủ
 * gian hàng có cả hai danh sách và chúng không trộn vào nhau — tiền hoàn chuyến của họ với tư
 * cách khách không đi chung đường với tiền của gian hàng.
 *
 * Chủ sở hữu luôn lấy từ session. Không endpoint nào ở đây nhận id người dùng từ tham số.
 */
@ApiTags('bank-accounts')
@Controller('account/bank-accounts')
export class AccountBankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Tài khoản nhận tiền của tôi — mặc định lên đầu, số đã che' })
  @ApiOkResponse({ type: [BankAccountDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<BankAccountDto[]> {
    return this.accounts.list({ type: WALLET_OWNER_TYPE.USER, userId: user.id });
  }

  @Post()
  @ApiOperation({
    summary: 'Thêm tài khoản nhận tiền',
    description:
      'Tài khoản ĐẦU TIÊN tự thành mặc định. Trùng số tài khoản trong danh sách đang dùng thì ' +
      '409 `BANK_ACCOUNT_DUPLICATE` — ràng buộc nằm ở database, không phải ở một phép kiểm trước.',
  })
  @ApiOkResponse({ type: BankAccountDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveBankAccountDto,
  ): Promise<BankAccountDto> {
    return this.accounts.create({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, dto);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Đặt làm tài khoản nhận tiền mặc định' })
  @ApiOkResponse({ type: BankAccountDto })
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BankAccountDto> {
    return this.accounts.setDefault({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Bỏ dùng một tài khoản',
    description:
      'LƯU TRỮ chứ không xoá: lệnh chuyển tiền cũ còn trỏ về nó. Bỏ tài khoản mặc định thì ' +
      'tài khoản còn lại gần nhất lên thay.',
  })
  @ApiNoContentResponse()
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.accounts.archive({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, id);
  }
}
