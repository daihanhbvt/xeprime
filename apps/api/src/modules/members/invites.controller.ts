import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, PLAN_FEATURE, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  RequiresFeature,
  SubscriptionTrackOnly,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  CreateInviteDto,
  CreateInviteResultDto,
  InviteDto,
  InviteListQueryDto,
  InvitePageDto,
} from './dto/invite.dto';
import { InvitesService } from './invites.service';

/**
 * Thư mời vào gian hàng — phía GIAN HÀNG gửi và theo dõi.
 *
 * Nằm dưới `/members/invites` chứ không phải một tuyến riêng: đây là cùng một việc với quản lý
 * nhân sự, cùng bộ quyền `members.*`, và cùng cờ tính năng. Đường trả lời của người ĐƯỢC mời ở
 * `InviteAnswersController` (`/invites/:token`) — nó không tenant-scoped được, vì người trả lời
 * chưa phải thành viên của gian hàng nào.
 */
@ApiTags('members')
@Controller('members/invites')
@TenantScoped()
@SubscriptionTrackOnly()
@RequiresFeature(PLAN_FEATURE.MEMBERS)
@Realms(ACCOUNT_REALM.PARTNER)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.MEMBER_VIEW)
  @ApiOperation({ summary: 'Lời mời của gian hàng — mặc định chỉ những lời đang chờ' })
  @ApiOkResponse({ type: InvitePageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: InviteListQueryDto,
  ): Promise<InvitePageDto> {
    return this.invites.list(tenant.tenantId, query) as Promise<InvitePageDto>;
  }

  /**
   * Hạn mức chặt hơn mức chung 120/phút: mỗi lời gọi ở đây sinh một token mời mới (và thu hồi
   * token cũ của cùng số). Không gửi thư hay SMS nữa (ADR 0060), nhưng một vòng lặp gọi không giới
   * hạn vẫn là cách đổ đầy bảng lời mời và nhật ký audit của gian hàng.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({
    summary:
      'Tạo lời mời tham gia gian hàng (SĐT + vai trò) — trả link một lần để người mời tự gửi (ADR 0060)',
  })
  @ApiCreatedResponse({ type: CreateInviteResultDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ): Promise<CreateInviteResultDto> {
    return this.invites.create(tenant.tenantId, user.id, dto, tenant.allowedBranchIds);
  }

  @Post(':id/revoke')
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({ summary: 'Thu hồi một lời mời đang chờ — link đã gửi hết giá trị ngay' })
  @ApiOkResponse({ type: InviteDto })
  revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InviteDto> {
    return this.invites.revoke(tenant.tenantId, user.id, id, tenant.allowedBranchIds);
  }
}
