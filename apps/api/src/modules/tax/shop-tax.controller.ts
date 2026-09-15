import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { TenantTaxSummaryDto } from './dto/tax.dto';
import { TaxReadService } from './tax-read.service';

/**
 * "Thuế đã khấu trừ trong kỳ" nhìn từ CHỦ XE — Phase 8.
 *
 * `tenant_id` từ membership, KHÔNG từ query: đây là bề mặt mà một API nhận chủ từ tham số sẽ cho
 * người lạ đọc nghĩa vụ thuế của gian hàng khác.
 *
 * KHÔNG gắn `@RequiresFeature`: biết mình bị khấu trừ bao nhiêu thuộc bộ CƠ BẢN (ADR 0027 điều
 * 1) — chủ xe nào cũng phải xem được, và gói hết hạn không được lấy đi quyền đó (điều 3). Thứ
 * thuộc gói là SỔ TỔNG HỢP nhiều kỳ, không phải con số của chính mình.
 *
 * Quyền `finance.view`: đây là số liệu tiền, nên nhân viên trực đơn không đương nhiên thấy.
 */
@ApiTags('shop-tax')
@Controller('shop/tax')
@TenantScoped()
export class ShopTaxController {
  constructor(private readonly read: TaxReadService) {}

  @Get('summary')
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({
    summary: 'Thuế đã khấu trừ của gian hàng trong một kỳ',
    description:
      'Thuế do CHỦ XE chịu: nó được trừ khỏi khoản XePrime phải trả (`D − T`), KHÔNG cộng vào ' +
      'tổng khách. Chỉ phát sinh khi chuyến ĐÃ BẮT ĐẦU — chuyến huỷ trước giờ nhận không có ' +
      'dòng nào ở đây (ADR 0032 điều 3).',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    example: '2026-09',
    description: 'Kỳ YYYY-MM theo giờ Việt Nam. Bỏ trống = kỳ hiện tại.',
  })
  @ApiOkResponse({ type: TenantTaxSummaryDto })
  summary(
    @CurrentTenant() tenant: TenantContext,
    @Query('period') period?: string,
  ): Promise<TenantTaxSummaryDto> {
    return this.read.tenantSummary(tenant.tenantId, period ?? this.read.currentPeriodKey());
  }
}
