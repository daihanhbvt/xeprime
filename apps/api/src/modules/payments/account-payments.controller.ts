import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { AccountPaymentsService } from './account-payments.service';
import {
  AccountPaymentListQueryDto,
  AccountPaymentPageDto,
} from './dto/account-payment.dto';

/**
 * "Tiền của các chuyến đã thuê" — bề mặt KHÁCH của `payments` (PROMPT 5).
 *
 * KHÔNG gắn `@TenantScoped`: đây là tài khoản CÁ NHÂN. Phạm vi đọc khoá theo
 * `booking.bookingRequest.customerUserId` trong service, không theo tenant — một chủ gian hàng
 * mở màn này thấy tiền họ đã TRẢ với tư cách khách, không thấy tiền họ đã THU.
 *
 * KHÔNG gắn `@RequiresFeature`: biết mình đã trả bao nhiêu cho một chuyến không thuộc gói nào.
 */
@ApiTags('account-payments')
@Controller('account/payments')
export class AccountPaymentsController {
  constructor(private readonly payments: AccountPaymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Các khoản tôi đã trả cho chuyến đã thuê — phân trang server-side',
    description:
      'Đọc từ `payments`: tiền khách trả cho GIAN HÀNG. KHÔNG phải ví điểm (`/account/balance`) ' +
      'và không phải khoản giữ chỗ chuyển cho XePrime (`/trips/:id`) — ba bảng, ba chủ nợ, ba ' +
      'màn hình. `totals` chỉ cộng khoản `succeeded`.',
  })
  @ApiOkResponse({ type: AccountPaymentPageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AccountPaymentListQueryDto,
  ): Promise<AccountPaymentPageDto> {
    return this.payments.list(user.id, query) as Promise<AccountPaymentPageDto>;
  }
}
