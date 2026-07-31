import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BillingService } from './billing.service';
import { CreatePlanDto, PlanDto, PlanListQueryDto, UpdatePlanDto } from './dto/billing.dto';

/** Danh mục gói dịch vụ (Phase 7, ADR 0010). Plan chỉ archive, không xoá. */
@ApiTags('platform-plans')
@Controller('platform/plans')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BILLING_MANAGE)
export class PlansController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách gói (mặc định chỉ gói đang bán; status=all để xem hết)' })
  @ApiOkResponse({ type: [PlanDto] })
  list(@Query() query: PlanListQueryDto): Promise<PlanDto[]> {
    return this.billing.listPlans(query);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo gói mới' })
  @ApiOkResponse({ type: PlanDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePlanDto): Promise<PlanDto> {
    return this.billing.createPlan(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa gói (giá mới chỉ áp cho lượt gán sau — price snapshot)' })
  @ApiOkResponse({ type: PlanDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanDto> {
    return this.billing.updatePlan(user.id, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ngừng bán gói (thuê bao đã gán giữ nguyên hiệu lực)' })
  @ApiOkResponse({ type: PlanDto })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PlanDto> {
    return this.billing.archivePlan(user.id, id);
  }
}
