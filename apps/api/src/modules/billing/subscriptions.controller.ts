import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BillingService } from './billing.service';
import {
  AddSlotsDto,
  AssignSubscriptionDto,
  SubscriptionDto,
  SubscriptionListQueryDto,
  SubscriptionPageDto,
} from './dto/billing.dto';

/**
 * Thuê bao gói của một gian hàng (Phase 7, ADR 0010). Lịch sử append-only — gán/gia hạn chèn
 * dòng mới, "hết hạn" suy ra từ endsAt.
 */
@ApiTags('platform-subscriptions')
@Controller('platform/tenants/:tenantId/subscriptions')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BILLING_MANAGE)
export class SubscriptionsController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'Lịch sử thuê bao của gian hàng (mới nhất trước)' })
  @ApiOkResponse({ type: SubscriptionPageDto })
  list(
    @Param('tenantId') tenantId: string,
    @Query() query: SubscriptionListQueryDto,
  ): Promise<SubscriptionPageDto> {
    return this.billing.listSubscriptions(tenantId, query) as Promise<SubscriptionPageDto>;
  }

  @Post()
  @ApiOperation({ summary: 'Gán / gia hạn gói (chu kỳ mới nối đuôi gói còn hạn)' })
  @ApiOkResponse({ type: SubscriptionDto })
  assign(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.billing.assign(tenantId, user.id, dto);
  }

  @Post('add-slots')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mua thêm chỗ giữa kỳ (đã thu tiền): huỷ dòng hiện hành + chèn dòng mới cùng ends_at, prorate tròn tháng (ADR 0015 điều 8)',
  })
  @ApiOkResponse({ type: SubscriptionDto })
  addSlots(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddSlotsDto,
  ): Promise<SubscriptionDto> {
    return this.billing.addSlots(tenantId, user.id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Huỷ sớm một thuê bao đang hiệu lực' })
  @ApiOkResponse({ type: SubscriptionDto })
  cancel(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SubscriptionDto> {
    return this.billing.cancel(tenantId, user.id, id);
  }
}
