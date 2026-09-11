import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  MarkWithdrawalPaidDto,
  PlatformWithdrawalPageDto,
  PlatformWithdrawalQueryDto,
  RejectWithdrawalDto,
  ReverseWithdrawalDto,
} from './dto/platform-withdrawal.dto';
import { PlatformWithdrawalService } from './platform-withdrawal.service';

/**
 * Hàng đợi RÚT TIỀN của admin — ADR 0033, ADR 0025 điều 7.
 *
 * Chuyển khoản ở Việt Nam là đẩy, nên mỗi dòng ở đây là một việc tay của một con người. Hàng đợi
 * vì thế sắp theo TUỔI và hiện hạn cam kết: một lệnh quá hạn phải nhìn thấy được ngay, không
 * phải tìm bằng cách đọc từng dòng.
 *
 * Bốn hành động, và ranh giới giữa chúng là ranh giới TIỀN:
 *
 *   approve  duyệt — tiền vẫn bị khoá, chưa rời ngân hàng
 *   paid     đã chuyển — bút toán ÂM ghi vào sổ, bắt buộc có mã giao dịch làm bằng chứng
 *   reject   từ chối — nhả khoá, tiền về khả dụng, KHÔNG bút toán nào
 *   reverse  chuyển hụt/sai tài khoản — dòng ĐẢO, tiền quay lại, cả hai dòng cùng nằm trên sổ
 */
@ApiTags('platform-money')
@Controller('platform/money/withdrawals')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
export class PlatformWithdrawalsController {
  constructor(private readonly withdrawals: PlatformWithdrawalService) {}

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi yêu cầu rút — mặc định VIỆC CẦN LÀM, cũ nhất trước',
    description:
      'Không lọc thì chỉ hiện `pending` + `approved` (những lệnh còn phải làm gì đó). ' +
      '`overdue=true` lọc riêng các lệnh đã quá hạn cam kết.',
  })
  @ApiOkResponse({ type: PlatformWithdrawalPageDto })
  list(@Query() query: PlatformWithdrawalQueryDto): Promise<PlatformWithdrawalPageDto> {
    return this.withdrawals.list(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Duyệt — bắt đầu đếm hạn cam kết',
    description: 'Tiền VẪN bị khoá, chưa rời ngân hàng. Duyệt và chi là hai việc, đôi khi hai người.',
  })
  @ApiNoContentResponse()
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.withdrawals.approve(id, user.id);
  }

  @Post(':id/paid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đã chuyển khoản — ghi bút toán âm',
    description:
      'Bắt buộc có mã giao dịch ngân hàng: đây là đầu duy nhất của đối soát chiều RA, và DB ' +
      'cũng chặn một lệnh `paid` không có bằng chứng. `rowVersion` chặn hai admin cùng bấm.',
  })
  @ApiNoContentResponse()
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkWithdrawalPaidDto,
  ): Promise<void> {
    return this.withdrawals.markPaid(id, user.id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Từ chối — nhả khoá, tiền về số dư khả dụng',
    description: 'Không sinh bút toán nào: tiền chưa bao giờ rời ví, nó chỉ bị treo.',
  })
  @ApiNoContentResponse()
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectWithdrawalDto,
  ): Promise<void> {
    return this.withdrawals.reject(id, user.id, dto);
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Chuyển hụt / sai tài khoản — đảo bút toán đã chi',
    description:
      'Tiền quay lại ví bằng một dòng MỚI trỏ về dòng cũ, không phải bằng cách sửa dòng cũ ' +
      '(ADR 0023 điều 4). Người đọc sổ thấy cả hai sự kiện.',
  })
  @ApiNoContentResponse()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReverseWithdrawalDto,
  ): Promise<void> {
    return this.withdrawals.reverse(id, user.id, dto);
  }
}
