import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import {
  DebtListQueryDto,
  DebtPageDto,
  FinanceSummaryDto,
  FinanceSummaryQueryDto,
} from './dto/finance.dto';
import { FinanceOverviewService } from './finance-overview.service';

/** Công nợ + dashboard tài chính — tenant-scoped, chỉ đọc. */
@ApiTags('finance-overview')
@Controller()
@TenantScoped()
export class FinanceOverviewController {
  constructor(private readonly overview: FinanceOverviewService) {}

  @Get('debts')
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
  @RequirePermissions(PERMISSION.FINANCE_VIEW)
  @ApiOperation({ summary: 'Tổng quan tài chính: thu/chi/cân đối/công nợ theo kỳ' })
  @ApiOkResponse({ type: FinanceSummaryDto })
  summary(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: FinanceSummaryQueryDto,
  ): Promise<FinanceSummaryDto> {
    return this.overview.summary(tenant.tenantId, query);
  }
}
