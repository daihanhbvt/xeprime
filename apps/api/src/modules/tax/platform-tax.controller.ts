import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PERMISSION, TAX_WITHHOLDING_STATUS } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ReverseTaxDto,
  TaxPeriodAdvancedDto,
  TaxPeriodQueryDto,
  TaxPeriodSummaryDto,
  TaxRowPageDto,
  TaxRowsQueryDto,
} from './dto/tax.dto';
import { TaxReadService } from './tax-read.service';
import { TaxService } from './tax.service';

/**
 * SỔ THUẾ của nền tảng — Phase 8 (ADR 0032 điều 3, ADR 0028 điều 3–4).
 *
 * Nằm dưới `/platform/money` cùng hold / refund / withdrawal / bảo hiểm / đối soát: sáu bề mặt
 * đó là MỘT công việc của cùng một người — "tiền của ai đang ở đâu, và hôm nay phải làm gì".
 *
 * Chuyển trạng thái theo KỲ, không theo dòng: cơ quan thuế làm việc theo tờ khai tháng, và cho
 * bấm từng dòng sẽ sinh ra những kỳ nửa-khai mà không tờ khai nào khớp.
 */
@ApiTags('platform-tax')
@Controller('platform/money/tax')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
export class PlatformTaxController {
  constructor(
    private readonly read: TaxReadService,
    private readonly tax: TaxService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Tờ khai một kỳ — tổng, chia theo loại chủ thể, chia theo gian hàng',
    description:
      'Chia theo `entityType` vì cá nhân / hộ kinh doanh / doanh nghiệp có nghĩa vụ khác nhau. ' +
      'Nhóm `unknown` là gian hàng CHƯA khai hồ sơ người bán — nó hiện ra thay vì bị gộp vào ' +
      '`individual`, vì gộp là đoán hộ họ một nghĩa vụ pháp lý.',
  })
  @ApiOkResponse({ type: TaxPeriodSummaryDto })
  summary(@Query() query: TaxPeriodQueryDto): Promise<TaxPeriodSummaryDto> {
    return this.read.periodSummary(query.period);
  }

  @Get('rows')
  @ApiOperation({
    summary: 'Từng dòng nghĩa vụ — phân trang server-side',
    description: '`amount` ÂM là bút toán ĐẢO; nó nằm cùng kỳ với dòng gốc.',
  })
  @ApiOkResponse({ type: TaxRowPageDto })
  rows(@Query() query: TaxRowsQueryDto): Promise<TaxRowPageDto> {
    return this.read.rows(query) as Promise<TaxRowPageDto>;
  }

  @Get('export')
  @ApiOperation({
    summary: 'Xuất CSV một kỳ để dán vào biểu mẫu tờ khai',
    description:
      'Dựng ở SERVER: một kỳ đông đơn có vài nghìn dòng, và tải hết về trình duyệt chỉ để ghép ' +
      'chuỗi là cách chắc chắn làm treo màn hình. File có BOM UTF-8 vì Excel trên Windows đọc ' +
      'CSV không BOM bằng codepage hệ thống và mọi tên có dấu sẽ thành ký tự lạ.',
  })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOkResponse({ schema: { type: 'string' } })
  async exportCsv(@Query() query: TaxPeriodQueryDto): Promise<string> {
    return this.read.periodCsv(query.period);
  }

  @Post('periods/:period/declared')
  @ApiOperation({
    summary: 'Đánh dấu CẢ KỲ đã kê khai (`accrued → declared`)',
    description: 'Chạy lại chỉ đụng dòng còn `accrued` — bấm hai lần không đẩy sang `remitted`.',
  })
  @ApiOkResponse({ type: TaxPeriodAdvancedDto })
  async markDeclared(
    @Param('period') period: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaxPeriodAdvancedDto> {
    const { updated } = await this.tax.advancePeriod(
      period,
      TAX_WITHHOLDING_STATUS.DECLARED,
      user.id,
    );
    return { updated, status: TAX_WITHHOLDING_STATUS.DECLARED };
  }

  @Post('periods/:period/remitted')
  @ApiOperation({
    summary: 'Đánh dấu CẢ KỲ đã nộp (`declared → remitted`)',
    description:
      'Chỉ đi từ `declared`: không có đường "nộp mà chưa khai". Sau bước này tiền thôi nằm ở vế ' +
      'GIỮ HỘ của đối soát ba vế.',
  })
  @ApiOkResponse({ type: TaxPeriodAdvancedDto })
  async markRemitted(
    @Param('period') period: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaxPeriodAdvancedDto> {
    const { updated } = await this.tax.advancePeriod(
      period,
      TAX_WITHHOLDING_STATUS.REMITTED,
      user.id,
    );
    return { updated, status: TAX_WITHHOLDING_STATUS.REMITTED };
  }

  @Post('rows/:id/reverse')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'ĐẢO một dòng — bắt buộc lý do, có audit',
    description:
      'Ghi một dòng ÂM trỏ về dòng gốc, KHÔNG sửa `amount` của dòng cũ (sổ chỉ-ghi-thêm). Dòng ' +
      '`remitted` không đảo được — tiền đã nộp thì sửa bằng tờ khai điều chỉnh.',
  })
  @ApiNoContentResponse()
  async reverse(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReverseTaxDto,
  ): Promise<void> {
    await this.tax.reverse(id, user.id, dto.reason);
  }
}
