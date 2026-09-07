import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  RequiresFeature,
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
@RequiresFeature(PLAN_FEATURE.MEMBERS)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @ApiOperation({ summary: 'Lời mời của gian hàng — mặc định chỉ những lời đang chờ' })
  @ApiOkResponse({ type: InvitePageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: InviteListQueryDto,
  ): Promise<InvitePageDto> {
    return this.invites.list(tenant.tenantId, query) as Promise<InvitePageDto>;
  }

  /**
   * Hạn mức chặt hơn mức chung 120/phút: mỗi lời gọi ở đây GỬI MỘT EMAIL tới địa chỉ do người
   * gọi tự nhập. Không giới hạn riêng thì một tài khoản gian hàng hợp lệ là một máy phát thư
   * rác mang tên miền XePrime, và cái mất là danh tiếng gửi thư của cả hệ thống.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({ summary: 'Gửi thư mời tham gia gian hàng (email + vai trò)' })
  @ApiCreatedResponse({ type: CreateInviteResultDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ): Promise<CreateInviteResultDto> {
    return this.invites.create(tenant.tenantId, user.id, dto);
  }

  @Post(':id/revoke')
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({ summary: 'Thu hồi một lời mời đang chờ — link trong email hết giá trị ngay' })
  @ApiOkResponse({ type: InviteDto })
  revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InviteDto> {
    return this.invites.revoke(tenant.tenantId, user.id, id);
  }
}
