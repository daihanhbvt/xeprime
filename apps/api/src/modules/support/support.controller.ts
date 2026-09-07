import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, SUPPORT_PARTY, type SupportCaseStatus } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  OpenSupportCaseDto,
  PostSupportEventDto,
  SupportCaseDetailDto,
  SupportCaseListQueryDto,
  SupportCasePageDto,
  TransitionSupportCaseDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

/**
 * Hỗ trợ / tranh chấp — bề mặt của GIAN HÀNG (R3).
 *
 * Bộ CƠ BẢN (ADR 0027 điều 1): chủ xe cơ bản cũng phải trả lời được tranh chấp về chuyến của
 * mình — khoá nó sau một gói là để mặc họ giữa một khiếu nại có hệ quả tiền.
 */
@ApiTags('support')
@Controller('support/cases')
@TenantScoped()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  private actor(user: AuthenticatedUser, tenant: TenantContext) {
    return { userId: user.id, scope: SUPPORT_PARTY.TENANT, tenantId: tenant.tenantId } as const;
  }

  @Get()
  @RequirePermissions(PERMISSION.SUPPORT_VIEW)
  @ApiOperation({ summary: 'Case của gian hàng — mặc định chỉ case còn MỞ' })
  @ApiOkResponse({ type: SupportCasePageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
    @Query() query: SupportCaseListQueryDto,
  ): Promise<SupportCasePageDto> {
    return this.support.list(this.actor(user, tenant), query) as Promise<SupportCasePageDto>;
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.SUPPORT_VIEW)
  @ApiOperation({ summary: 'Chi tiết + dòng thời gian (ghi chú nội bộ của XePrime KHÔNG hiện)' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<SupportCaseDetailDto> {
    return this.support.detail(id, this.actor(user, tenant));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSION.SUPPORT_MANAGE)
  @ApiOperation({ summary: 'Mở case mới (tranh chấp bắt buộc gắn đơn thuê của gian hàng)' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  open(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: OpenSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.open(this.actor(user, tenant), dto);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSION.SUPPORT_MANAGE)
  @ApiOperation({ summary: 'Trả lời trong case' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  message(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PostSupportEventDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.postMessage(id, this.actor(user, tenant), dto);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.SUPPORT_MANAGE)
  @ApiOperation({ summary: 'Đóng case do chính gian hàng mở (kết luận là việc của XePrime)' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  transition(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: TransitionSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.transition(
      id,
      this.actor(user, tenant),
      dto.status as SupportCaseStatus,
      dto.note ?? null,
    );
  }
}
