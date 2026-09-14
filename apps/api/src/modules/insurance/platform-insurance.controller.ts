import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  PlatformInsuranceListQueryDto,
  PlatformInsurancePageDto,
  VoidInsurancePolicyDto,
} from './dto/insurance.dto';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceService } from './insurance.service';

/**
 * Hàng đợi BẢO HIỂM của nền tảng — Phase 7 (ADR 0032 điều 4).
 *
 * Nằm dưới `/platform/money` cùng hold / refund / withdrawal / đối soát: bốn thứ đó và cái này
 * là MỘT công việc của cùng một người trực — "hôm nay có khoản tiền nào của khách đang mắc kẹt".
 * Tách ra một menu riêng là bắt họ nhớ mở thêm một tab.
 *
 * Mặc định lọc `failed`: đó là hàng đợi VIỆC CẦN LÀM. Hợp đồng `issued` không cần ai nhìn.
 */
@ApiTags('platform-insurance')
@Controller('platform/money/insurance')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
export class PlatformInsuranceController {
  constructor(
    private readonly read: InsuranceReadService,
    private readonly insurance: InsuranceService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi hợp đồng bảo hiểm — mặc định chỉ các hợp đồng ĐANG LỖI',
    description:
      'Phí của hợp đồng chưa quyết toán nằm ở vế GIỮ HỘ của đối soát ba vế: mỗi dòng ở đây là ' +
      'một khoản tiền khách đã trả mà chưa có chứng nhận nào được cấp.',
  })
  @ApiOkResponse({ type: PlatformInsurancePageDto })
  list(@Query() query: PlatformInsuranceListQueryDto): Promise<PlatformInsurancePageDto> {
    return this.read.listForPlatform(query) as Promise<PlatformInsurancePageDto>;
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Thử phát hành lại',
    description:
      'Chỉ đặt lại mốc để worker nhặt ở vòng kế tiếp — KHÔNG gọi đối tác ngay trong request, ' +
      'vì một đối tác chậm sẽ treo tab của người trực.',
  })
  @ApiNoContentResponse()
  async retry(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.insurance.retry(id, user.id);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Thu hồi hợp đồng — bắt buộc lý do, có audit' })
  @ApiNoContentResponse()
  async void(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VoidInsurancePolicyDto,
  ): Promise<void> {
    await this.insurance.voidPolicy(id, user.id, dto.reason);
  }
}
