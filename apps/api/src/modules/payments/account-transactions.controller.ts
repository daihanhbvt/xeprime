import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM } from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { AccountTransactionsService } from './account-transactions.service';
import {
  AccountTransactionListQueryDto,
  AccountTransactionPageDto,
} from './dto/account-transaction.dto';

/**
 * "Lịch sử giao dịch" hợp nhất của TÀI KHOẢN KHÁCH — giữ chỗ, rút ví, hoàn tiền, tiền thuê.
 *
 * Phạm vi lấy từ phiên (`user.id`); không `@TenantScoped`, không `@RequiresFeature` — đây là
 * tiền của cá nhân. Chỉ đọc; huỷ lệnh rút vẫn đi `POST /account/wallet/withdrawals/:id/cancel`.
 */
@ApiTags('account-payments')
@Controller('account/transactions')
@Realms(ACCOUNT_REALM.CUSTOMER)
export class AccountTransactionsController {
  constructor(private readonly transactions: AccountTransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lịch sử giao dịch của tôi — một danh sách hợp nhất, phân trang server-side',
    description:
      'Gộp tiền giữ chỗ (SePay + cổng), lệnh rút ví điểm, dòng ghi có ví, hoàn tiền chuyển thẳng ' +
      'và khoản tiền thuê/cọc. Số tiền có dấu theo góc nhìn khách. Lọc `status` + khoảng ngày ' +
      'giờ Việt Nam; mới nhất trước.',
  })
  @ApiOkResponse({ type: AccountTransactionPageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AccountTransactionListQueryDto,
  ): Promise<AccountTransactionPageDto> {
    return this.transactions.list(user.id, query);
  }
}
