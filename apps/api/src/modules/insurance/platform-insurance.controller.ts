import {
  Body,
  Controller,
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
  PlatformInsuranceListQueryDto,
  PlatformInsurancePageDto,
  PlatformInsurancePolicyDetailDto,
  VoidInsurancePolicyDto,
  VoidInsurancePolicyResultDto,
} from './dto/insurance.dto';
import {
  InsuranceAttentionPageDto,
  InsurancePolicyPricingDto,
} from './dto/insurance-follow-up.dto';
import { InsuranceCertificateService } from './insurance-certificate.service';
import { InsuranceFollowUpService } from './insurance-follow-up.service';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceRefundService } from './insurance-refund.service';
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
    private readonly certificates: InsuranceCertificateService,
    private readonly followUp: InsuranceFollowUpService,
    private readonly refunds: InsuranceRefundService,
  ) {}

  @Get(':id/certificate.pdf')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Tải GCN PDF của một hợp đồng từ hãng (ADR 0088)' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async certificatePdf(@Param('id') id: string): Promise<StreamableFile> {
    const pdf = await this.certificates.pdf(id, {});
    return new StreamableFile(pdf.file, {
      type: 'application/pdf',
      length: pdf.file.length,
      disposition: `attachment; filename="${pdf.fileName}"`,
    });
  }

  @Get('attention')
  @ApiOperation({
    summary:
      'Hợp đồng cần xử lý gấp - quá 2 giờ sau giao xe chưa cấp, hoặc MIC hết lượt tra mà chưa nhận ảnh (ADR 0091)',
  })
  @ApiOkResponse({ type: InsuranceAttentionPageDto })
  attention(): Promise<InsuranceAttentionPageDto> {
    return this.followUp.attention();
  }

  @Get(':id/pricing')
  @ApiOperation({
    summary:
      'Phí thực tế của một hợp đồng - giá trị xe, bậc, phí đã thu, phí MIC tính, chênh lệch (ADR 0091)',
  })
  @ApiOkResponse({ type: InsurancePolicyPricingDto })
  pricing(@Param('id') id: string): Promise<InsurancePolicyPricingDto> {
    return this.followUp.pricingOf(id);
  }

  @Get()
  @ApiOperation({
    summary: 'Hàng đợi hợp đồng bảo hiểm - mặc định chỉ các hợp đồng ĐANG LỖI',
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
    summary: 'Chi tiết một hợp đồng - kèm yêu cầu/phản hồi nguyên trạng với đối tác',
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
      'Chỉ đặt lại mốc để worker nhặt ở vòng kế tiếp (≤ 60 giây) - KHÔNG gọi đối tác ngay trong ' +
      'request, vì một đối tác chậm sẽ treo tab của người trực. Môi trường chưa cắm đối tác trả ' +
      '409 `INSURANCE_PARTNER_NOT_CONFIGURED`.',
  })
  @ApiNoContentResponse()
  async retry(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.insurance.retry(id, user.id);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thu hồi hợp đồng - hai nhánh theo hiệu lực (ADR 0093), bắt buộc lý do, có audit',
    description:
      'Chưa từng có hiệu lực ⇒ huỷ + hoàn phí và phí thu hộ vào Ví điểm khách (ngay khi hold đã chốt, ' +
      'chưa chốt thì vòng tự hoàn làm sau). Đã có hiệu lực ⇒ thu hồi, không hoàn, phí vẫn kê trả hãng. ' +
      'Hợp đồng đã có bên đối tác bắt buộc `partnerReference` (`INSURANCE_VOID_REFERENCE_REQUIRED`); đã ' +
      'nằm trong bảng kê thì không huỷ-hoàn được (`INSURANCE_POLICY_REMITTED`).',
  })
  @ApiOkResponse({ type: VoidInsurancePolicyResultDto })
  void(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VoidInsurancePolicyDto,
  ): Promise<VoidInsurancePolicyResultDto> {
    return this.refunds.voidPolicy(id, user.id, dto);
  }
}
