import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
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
// Tài khoản ngân hàng của ví cá nhân — đi theo chủ ví, tức tài khoản khách (ADR 0053 điều 8).
@Realms(ACCOUNT_REALM.CUSTOMER)
export class AccountBankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'Tài khoản nhận tiền của tôi — số đã che',
    description: 'Mảng 0 hoặc 1 phần tử: mỗi chủ MỘT tài khoản nhận tiền đang dùng.',
  })
  @ApiOkResponse({ type: [BankAccountDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<BankAccountDto[]> {
    return this.accounts.list({ type: WALLET_OWNER_TYPE.USER, userId: user.id });
  }

  @Post()
  @ApiOperation({
    summary: 'Thêm hoặc ĐỔI tài khoản nhận tiền',
    description:
      'Mỗi chủ một tài khoản: đã có thì tài khoản mới THAY cái cũ (cái cũ lưu trữ, lệnh rút đang ' +
      'chờ giữ đích đã chụp). Khai lại đúng tài khoản đang dùng thì không tạo dòng mới.',
  })
  @ApiOkResponse({ type: BankAccountDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveBankAccountDto,
  ): Promise<BankAccountDto> {
    return this.accounts.create({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, dto, user.id);
  }

  @Patch(':id/default')
  @ApiOperation({
    summary: 'Đặt làm tài khoản nhận tiền mặc định',
    description: 'Tương thích ngược — tài khoản duy nhất luôn là mặc định; trả lại chính nó.',
    deprecated: true,
  })
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
    summary: 'Bỏ dùng tài khoản nhận tiền',
    description:
      'LƯU TRỮ chứ không xoá: lệnh chuyển tiền cũ còn trỏ về nó. Sau đó chưa có tài khoản nhận ' +
      'tiền cho tới khi khai cái mới.',
  })
  @ApiNoContentResponse()
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.accounts.archive({ type: WALLET_OWNER_TYPE.USER, userId: user.id }, id, user.id);
  }
}
