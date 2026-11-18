import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import {
  InsuranceOverviewDto,
  InsuranceOverviewQueryDto,
  InsurancePremiumCheckDto,
  InsurancePremiumCheckResultDto,
  InsuranceVehicleListQueryDto,
  InsuranceVehiclePageDto,
} from './dto/insurance-insights.dto';
import { InsuranceInsightsService } from './insurance-insights.service';

/**
 * Số liệu quản trị bảo hiểm của nền tảng — ADR 0097. Chỉ đọc.
 *
 * Tổng quan là TIỀN (phải trả hãng, hoa hồng, phí thu hộ) nên gác bằng quyền ca trực tiền như hàng
 * đợi hợp đồng và bảng kê. Danh sách xe + đối chiếu biểu phí là việc của người quản lý danh mục bảo
 * hiểm, gác bằng `platform.insurance.manage` như màn Sản phẩm.
 */
@ApiTags('platform-insurance')
@Controller('platform/insurance')
@PlatformOnly()
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformInsuranceInsightsController {
  constructor(private readonly insights: InsuranceInsightsService) {}

  @Get('overview')
  @RequirePermissions(PERMISSION.PLATFORM_MONEY_MANAGE)
  @ApiOperation({
    summary:
      'Tổng quan bảo hiểm một tháng - phí thu khách, phải trả hãng, hoa hồng đại lý, phí thu hộ, chênh lệch, nguồn phí',
  })
  @ApiOkResponse({ type: InsuranceOverviewDto })
  overview(@Query() query: InsuranceOverviewQueryDto): Promise<InsuranceOverviewDto> {
    return this.insights.overview(query.month);
  }

  @Get('vehicles')
  @RequirePermissions(PERMISSION.PLATFORM_INSURANCE_MANAGE)
  @ApiOperation({
    summary: 'Ô tô và bảo hiểm - giá trị xe, chế độ chủ xe, điều kiện còn thiếu, phí theo từng bậc',
  })
  @ApiOkResponse({ type: InsuranceVehiclePageDto })
  vehicles(@Query() query: InsuranceVehicleListQueryDto): Promise<InsuranceVehiclePageDto> {
    return this.insights.vehicles(query);
  }

  @Post('premium-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_INSURANCE_MANAGE)
  // Mỗi lượt gọi hãng một lần cho MỖI bậc — chặn bấm liên tục làm phiền API của đối tác.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Đối chiếu biểu phí với hãng - hỏi hãng phí từng bậc cho một xe, so với bảng bậc',
    description:
      'Gọi API tính phí của đối tác (MIC `phi_vcx`) cho mỗi bậc, chờ tối đa 8 giây. Không ghi gì. ' +
      'Đối tác chưa cắm hoặc không có API tính phí ⇒ cột hãng trống kèm lý do.',
  })
  @ApiOkResponse({ type: InsurancePremiumCheckResultDto })
  premiumCheck(@Body() dto: InsurancePremiumCheckDto): Promise<InsurancePremiumCheckResultDto> {
    return this.insights.premiumCheck(dto);
  }
}
