import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import {
  CurrentTenant,
  RequirePermissions,
  RequiresFeature,
  TenantScoped,
} from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import {
  CustomerRevenuePageDto,
  CustomerRevenueQueryDto,
  DebtListQueryDto,
  DebtPageDto,
  FinanceCategoryBreakdownDto,
  FinanceCategoryBreakdownQueryDto,
  FinanceSeriesDto,
  FinanceSeriesQueryDto,
  FinanceSummaryDto,
  FinanceSummaryQueryDto,
  VehicleProfitPageDto,
  VehicleProfitQueryDto,
} from './dto/finance.dto';
import { FinanceOverviewService } from './finance-overview.service';

/**
 * Công nợ + báo cáo tài chính — tenant-scoped, chỉ đọc.
 *
 * `@Controller()` với path trần và KHÔNG có route `:id` nào, nên bốn route ở đây không dính bẫy
 * thứ tự khớp route mà `receipts.controller.ts` phải né.
 */
@ApiTags('finance-overview')
@Controller()
@TenantScoped()
export class FinanceOverviewController {
  constructor(private readonly overview: FinanceOverviewService) {}

  @Get('debts')
  @RequiresFeature(PLAN_FEATURE.DEBTS)
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Danh sách đơn còn công nợ (lọc quá hạn/sắp đến/chưa thu)' })
  @ApiOkResponse({ type: DebtPageDto })
  debts(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: DebtListQueryDto,
  ): Promise<DebtPageDto> {
    return this.overview.debts(tenant.tenantId, query) as Promise<DebtPageDto>;
  }

  @Get('finance/summary')
  @RequiresFeature(PLAN_FEATURE.FINANCE)
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({
    summary: 'Ba lớp tiền của một kỳ: kết quả kinh doanh, dòng tiền quỹ, cọc đang giữ + công nợ',
  })
  @ApiOkResponse({ type: FinanceSummaryDto })
  summary(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: FinanceSummaryQueryDto,
  ): Promise<FinanceSummaryDto> {
    return this.overview.summary(tenant.tenantId, query);
  }

  @Get('finance/series')
  @RequiresFeature(PLAN_FEATURE.FINANCE)
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({
    summary: 'Chuỗi thu-chi theo ngày/tuần/tháng — đã điền bucket rỗng, gộp theo giờ VN',
  })
  @ApiOkResponse({ type: FinanceSeriesDto })
  series(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: FinanceSeriesQueryDto,
  ): Promise<FinanceSeriesDto> {
    return this.overview.series(tenant.tenantId, query);
  }

  @Get('finance/by-category')
  @RequiresFeature(PLAN_FEATURE.FINANCE)
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Cơ cấu doanh thu hoặc chi phí theo danh mục thu/chi' })
  @ApiOkResponse({ type: FinanceCategoryBreakdownDto })
  byCategory(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: FinanceCategoryBreakdownQueryDto,
  ): Promise<FinanceCategoryBreakdownDto> {
    return this.overview.byCategory(tenant.tenantId, query);
  }

  @Get('finance/by-vehicle')
  @RequiresFeature(PLAN_FEATURE.FINANCE)
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({
    summary:
      'Lãi/lỗ theo từng xe trong kỳ. Chi phí chung chưa gắn xe nằm ở `/finance/summary` ' +
      '(`unassignedCost`) — nó là số của KỲ, không đổi theo trang',
  })
  @ApiOkResponse({ type: VehicleProfitPageDto })
  byVehicle(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VehicleProfitQueryDto,
  ): Promise<VehicleProfitPageDto> {
    return this.overview.byVehicle(tenant.tenantId, query) as Promise<VehicleProfitPageDto>;
  }

  @Get('finance/by-customer')
  @RequiresFeature(PLAN_FEATURE.FINANCE)
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({
    summary:
      'Doanh thu theo từng khách trong kỳ — tiền THẬT đã thu. Phần không gắn khách nào nằm ở ' +
      '`/finance/summary` (`unassignedRevenue`)',
  })
  @ApiOkResponse({ type: CustomerRevenuePageDto })
  byCustomer(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CustomerRevenueQueryDto,
  ): Promise<CustomerRevenuePageDto> {
    return this.overview.byCustomer(tenant.tenantId, query) as Promise<CustomerRevenuePageDto>;
  }
}
