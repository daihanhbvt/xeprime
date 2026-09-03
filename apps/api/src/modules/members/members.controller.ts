import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  AddMemberDto,
  MemberDto,
  MemberListQueryDto,
  MemberPageDto,
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
@RequiresFeature(PLAN_FEATURE.MEMBERS)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions(PERMISSION.MEMBER_VIEW)
  @ApiOperation({ summary: 'Danh sách thành viên gian hàng (phân trang, filter)' })
  @ApiOkResponse({ type: MemberPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MemberListQueryDto,
  ): Promise<MemberPageDto> {
    return this.members.list(tenant.tenantId, query) as Promise<MemberPageDto>;
  }

  @Post()
  @RequirePermissions(PERMISSION.MEMBER_INVITE)
  @ApiOperation({ summary: 'Thêm thành viên theo email (user phải đã có tài khoản)' })
  @ApiCreatedResponse({ type: MemberDto })
  add(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddMemberDto,
  ): Promise<MemberDto> {
    return this.members.add(tenant.tenantId, user.id, dto);
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
    return this.members.updateRole(tenant.tenantId, user.id, userId, dto);
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
    return this.members.remove(tenant.tenantId, user.id, userId);
  }
}
