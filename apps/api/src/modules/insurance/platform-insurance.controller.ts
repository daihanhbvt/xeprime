import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  PlatformInsuranceListQueryDto,
  PlatformInsurancePageDto,
  PlatformInsurancePolicyDetailDto,
  VoidInsurancePolicyDto,
} from './dto/insurance.dto';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceService } from './insurance.service';

/**
 * Hàng đợi GIẤY CHỨNG NHẬN bảo hiểm của nền tảng — ADR 0032 điều 4 · ADR 0064.
 *
 * Nằm dưới `/platform/money` cùng hold / refund / withdrawal / đối soát: mỗi dòng đang lỗi là một
 * khoản phí khách đã trả đang giữ hộ, nên nó gác bằng quyền của ca trực TIỀN
 * (`platform.money.manage`) — cả tab trong màn Tài chính lẫn tab "Chứng nhận" của màn Bảo hiểm.
 * Danh mục sản phẩm là việc nội dung, gác riêng bằng `platform.insurance.manage`.
 *
 * Mặc định lọc `failed`: đó là hàng đợi VIỆC CẦN LÀM; `status=any` xem toàn bộ lịch sử.
 */
@ApiTags('platform-insurance')
@Controller('platform/money/insurance')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformInsuranceController {
  constructor(
    private readonly read: InsuranceReadService,
    private readonly insurance: InsuranceService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi hợp đồng bảo hiểm — mặc định chỉ các hợp đồng ĐANG LỖI',
    description:
      'Phí của hợp đồng chưa quyết toán nằm ở vế GIỮ HỘ của đối soát ba vế: mỗi dòng lỗi là ' +
      'một khoản tiền khách đã trả mà chưa có chứng nhận nào được cấp. Lọc theo trạng thái ' +
      '(`any` = tất cả), loại sản phẩm, đơn, hoặc tìm theo mã đơn / số GCN.',
  })
  @ApiOkResponse({ type: PlatformInsurancePageDto })
  list(@Query() query: PlatformInsuranceListQueryDto): Promise<PlatformInsurancePageDto> {
    return this.read.listForPlatform(query) as Promise<PlatformInsurancePageDto>;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết một hợp đồng — kèm yêu cầu/phản hồi nguyên trạng với đối tác',
  })
  @ApiOkResponse({ type: PlatformInsurancePolicyDetailDto })
  detail(@Param('id') id: string): Promise<PlatformInsurancePolicyDetailDto> {
    return this.read.detailForPlatform(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Thử phát hành lại',
    description:
      'Chỉ đặt lại mốc để worker nhặt ở vòng kế tiếp (≤ 60 giây) — KHÔNG gọi đối tác ngay trong ' +
      'request, vì một đối tác chậm sẽ treo tab của người trực. Môi trường chưa cắm đối tác trả ' +
      '409 `INSURANCE_PARTNER_NOT_CONFIGURED`.',
  })
  @ApiNoContentResponse()
  async retry(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
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
