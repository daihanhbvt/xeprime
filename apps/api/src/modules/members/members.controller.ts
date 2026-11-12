import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  PERMISSION,
  PLAN_FEATURE,
  SUPPORT_CAPABILITY,
} from '@xeprime/types';
import { CurrentTenant, CurrentUser, Realms, RequirePermissions, RequiresFeature, SubscriptionTrackOnly, SupportAction, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { OkResultDto } from '../../common/dto/api-response.dto';
import {
  CreateMemberAccountDto,
  MemberActivityDto,
  MemberActivityQueryDto,
  MemberDto,
  MemberListQueryDto,
  MemberPageDto,
  MemberRoleSummaryDto,
  MemberRosterPageDto,
  MemberRosterQueryDto,
  ResetMemberPasswordDto,
  UpdateMemberRoleDto,
} from './dto/member.dto';
import { MembersService } from './members.service';

/**
 * Quản lý nhân sự gian hàng — tenant-scoped. `tenantId`/`userId` từ scope, không nhận client
 * (CLAUDE.md mục 6). Guard permission `members.*` là lớp chặn thật.
 */
@ApiTags('members')
@Controller('members')
@TenantScoped()
@SubscriptionTrackOnly()
@RequiresFeature(PLAN_FEATURE.MEMBERS)
@Realms(ACCOUNT_REALM.PARTNER)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.MEMBER_VIEW)
  @ApiOperation({ summary: 'Danh sách thành viên gian hàng (phân trang, filter)' })
  @ApiOkResponse({ type: MemberPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MemberListQueryDto,
  ): Promise<MemberPageDto> {
    return this.members.list(tenant.tenantId, query) as Promise<MemberPageDto>;
  }

  @Get('roster')
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.MEMBER_VIEW)
  @ApiOperation({
    summary: 'Danh sách nhân sự gộp: thành viên + lời mời còn chờ (phân trang, lọc vai/trạng thái)',
  })
  @ApiOkResponse({ type: MemberRosterPageDto })
  roster(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MemberRosterQueryDto,
  ): Promise<MemberRosterPageDto> {
    return this.members.roster(tenant.tenantId, query) as Promise<MemberRosterPageDto>;
  }

  @Get('roles')
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.MEMBER_VIEW)
  @ApiOperation({ summary: 'Bốn vai của gian hàng: khoá quyền + số người - nuôi ma trận Vai trò & quyền' })
  @ApiOkResponse({ type: MemberRoleSummaryDto, isArray: true })
  roles(@CurrentTenant() tenant: TenantContext): Promise<MemberRoleSummaryDto[]> {
    return this.members.roles(tenant.tenantId);
  }

  /**
   * Hạn mức chặt hơn mức chung: mỗi lượt là một tài khoản mới + một lần băm bcrypt cost 12.
   */
  @Post('accounts')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({
    summary: 'Cấp tài khoản nhân viên (tên đăng nhập + mật khẩu) và đưa vào gian hàng - ADR 0087',
  })
  @ApiCreatedResponse({ type: MemberDto })
  createAccount(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMemberAccountDto,
  ): Promise<MemberDto> {
    return this.members.createAccount(
      tenant.tenantId,
      user.id,
      tenant.roleKey,
      tenant.allowedBranchIds,
      dto,
    );
  }

  @Post(':userId/password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSION.MEMBER_UPDATE_ROLE)
  @ApiOperation({
    summary: 'Đặt lại mật khẩu tài khoản do gian hàng cấp - đăng xuất người đó khỏi mọi thiết bị',
  })
  @ApiOkResponse({ type: OkResultDto })
  async resetPassword(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: ResetMemberPasswordDto,
  ): Promise<OkResultDto> {
    await this.members.resetPassword(
      tenant.tenantId,
      user.id,
      userId,
      tenant.allowedBranchIds,
      dto.password,
    );
    return { ok: true };
  }

  @Get(':userId/activity')
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.MEMBER_VIEW)
  @ApiOperation({ summary: 'Việc gần đây của một thành viên trong gian hàng (nhật ký, tối đa 20)' })
  @ApiOkResponse({ type: MemberActivityDto, isArray: true })
  activity(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Query() query: MemberActivityQueryDto,
  ): Promise<MemberActivityDto[]> {
    return this.members.activity(tenant.tenantId, userId, query.limit);
  }

  @Post(':userId/lock')
  @HttpCode(200)
  @RequirePermissions(PERMISSION.MEMBER_UPDATE_ROLE)
  @ApiOperation({ summary: 'Tạm khoá thành viên - mất quyền vào gian hàng ở request kế tiếp' })
  @ApiOkResponse({ type: MemberDto })
  lock(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<MemberDto> {
    return this.members.lock(tenant.tenantId, user.id, userId, tenant.allowedBranchIds);
  }

  @Post(':userId/unlock')
  @HttpCode(200)
  @RequirePermissions(PERMISSION.MEMBER_UPDATE_ROLE)
  @ApiOperation({ summary: 'Mở khoá thành viên bị chủ khoá tay (khoá vì hết gói thì không mở tay được)' })
  @ApiOkResponse({ type: MemberDto })
  unlock(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<MemberDto> {
    return this.members.unlock(tenant.tenantId, user.id, userId, tenant.allowedBranchIds);
  }

  @Patch(':userId')
  @RequirePermissions(PERMISSION.MEMBER_UPDATE_ROLE)
  @ApiOperation({ summary: 'Đổi vai trò thành viên' })
  @ApiOkResponse({ type: MemberDto })
  updateRole(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MemberDto> {
    return this.members.updateRole(tenant.tenantId, user.id, userId, dto, tenant.allowedBranchIds);
  }

  @Delete(':userId')
  @RequirePermissions(PERMISSION.MEMBER_REMOVE)
  @ApiOperation({ summary: 'Gỡ thành viên khỏi gian hàng' })
  @ApiOkResponse({ schema: { properties: { userId: { type: 'string' } } } })
  remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<{ userId: string }> {
    return this.members.remove(tenant.tenantId, user.id, userId, tenant.allowedBranchIds);
  }
}
