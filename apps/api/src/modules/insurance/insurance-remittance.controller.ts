import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  CreateInsuranceRemittanceDto,
  InsuranceRemittanceDto,
  InsuranceRemittanceLinePageDto,
  InsuranceRemittanceListQueryDto,
  InsuranceRemittancePageDto,
  InsuranceRemittancePendingDto,
  PayInsuranceRemittanceDto,
} from './dto/insurance-remittance.dto';
import { InsuranceRemittanceService } from './insurance-remittance.service';

/**
 * Bảng kê trả phí bảo hiểm cho hãng — ADR 0088 điều 6. Cùng quyền với hàng đợi tiền của nền tảng
 * (`platform.money.manage`): đây là một vế của đối soát tiền giữ hộ.
 */
@ApiTags('platform-insurance')
@Controller('platform/money/insurance-remittances')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class InsuranceRemittanceController {
  constructor(private readonly remittances: InsuranceRemittanceService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách bảng kê trả phí bảo hiểm theo tháng' })
  @ApiOkResponse({ type: InsuranceRemittancePageDto })
  list(@Query() query: InsuranceRemittanceListQueryDto): Promise<InsuranceRemittancePageDto> {
    return this.remittances.list(query) as Promise<InsuranceRemittancePageDto>;
  }

  /** Khai TRƯỚC `:id` — Nest khớp route theo thứ tự khai báo. */
  @Get('pending')
  @ApiOperation({ summary: 'Hợp đồng đã cấp mà chưa nằm trong bảng kê nào' })
  @ApiOkResponse({ type: InsuranceRemittancePendingDto })
  pending(): Promise<InsuranceRemittancePendingDto> {
    return this.remittances.pending();
  }

  @Post()
  @ApiOperation({
    summary: 'Lập bảng kê NHÁP cho một tháng đã kết thúc',
    description:
      'Gom mọi hợp đồng đã cấp, chưa kê, cấp trước hết tháng. Phải trả = tổng phí - hoa hồng đại lý.',
  })
  @ApiCreatedResponse({ type: InsuranceRemittanceDto })
  create(
    @Body() dto: CreateInsuranceRemittanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InsuranceRemittanceDto> {
    return this.remittances.create(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một bảng kê' })
  @ApiOkResponse({ type: InsuranceRemittanceDto })
  detail(@Param('id') id: string): Promise<InsuranceRemittanceDto> {
    return this.remittances.detail(id);
  }

  @Get(':id/lines')
  @ApiOperation({ summary: 'Các hợp đồng trong một bảng kê (phân trang)' })
  @ApiOkResponse({ type: InsuranceRemittanceLinePageDto })
  lines(
    @Param('id') id: string,
    @Query() query: InsuranceRemittanceListQueryDto,
  ): Promise<InsuranceRemittanceLinePageDto> {
    return this.remittances.lines(id, query) as Promise<InsuranceRemittanceLinePageDto>;
  }

  @Get(':id/export.csv')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Xuất bảng kê CSV gửi hãng đối chiếu' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(@Param('id') id: string): Promise<StreamableFile> {
    const csv = await this.remittances.exportCsv(id);
    return new StreamableFile(csv.file, {
      type: 'text/csv; charset=utf-8',
      length: csv.file.length,
      disposition: `attachment; filename="${csv.fileName}"`,
    });
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Chốt số bảng kê (không thêm/bớt hợp đồng được nữa)' })
  @ApiOkResponse({ type: InsuranceRemittanceDto })
  finalize(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InsuranceRemittanceDto> {
    return this.remittances.finalize(id, user.id);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Ghi nhận đã chuyển tiền cho hãng' })
  @ApiOkResponse({ type: InsuranceRemittanceDto })
  pay(
    @Param('id') id: string,
    @Body() dto: PayInsuranceRemittanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InsuranceRemittanceDto> {
    return this.remittances.pay(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá bảng kê NHÁP - hợp đồng trở về "chưa kê"' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.remittances.remove(id, user.id);
  }
}
