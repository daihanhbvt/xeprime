import { Controller, Get, GoneException, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  PERMISSION,
  PLAN_FEATURE,
  SUPPORT_CAPABILITY,
} from '@xeprime/types';
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
  @ApiOperation({ summary: 'Lời mời của gian hàng - mặc định chỉ những lời đang chờ' })
  @ApiOkResponse({ type: InvitePageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: InviteListQueryDto,
  ): Promise<InvitePageDto> {
    return this.invites.list(tenant.tenantId, query) as Promise<InvitePageDto>;
  }

  /**
   * ĐÃ GỠ (ADR 0087): gian hàng CẤP tài khoản cho nhân viên (`POST /members/accounts`) thay vì mời
   * họ tự đăng ký bằng SĐT. Route giữ lại và trả 410 `MEMBER_INVITE_RETIRED` để app cũ nhận một câu
   * rõ ràng thay vì 404; lời mời đã gửi vẫn nhận / thu hồi được tới khi hết hạn 7 ngày.
   * `InvitesService.create` còn đó cho các spec dựng lời mời cũ để kiểm luồng nhận.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({
    summary: 'ĐÃ NGỪNG - luôn trả 410 MEMBER_INVITE_RETIRED; dùng POST /members/accounts (ADR 0087)',
    deprecated: true,
  })
  @ApiCreatedResponse({ type: CreateInviteResultDto })
  create(): never {
    throw new GoneException({
      code: API_ERROR_CODE.MEMBER_INVITE_RETIRED,
      message: 'Mời bằng số điện thoại đã ngừng - hãy cấp tài khoản cho nhân viên',
    });
  }

  @Post(':id/revoke')
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({ summary: 'Thu hồi một lời mời đang chờ - link đã gửi hết giá trị ngay' })
  @ApiOkResponse({ type: InviteDto })
  revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InviteDto> {
    return this.invites.revoke(tenant.tenantId, user.id, id, tenant.allowedBranchIds);
  }
}
