import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ApprovalListQueryDto,
  ApprovalTaskDetailDto,
  ApprovalTaskPageDto,
  ReviewActionDto,
} from './dto/approval.dto';
import { PlatformApprovalService } from './platform-approval.service';

/**
 * Duyệt của nền tảng. `@PlatformOnly` → PlatformScopeGuard nạp `req.platform`; KHÔNG dùng chung
 * guard với API gian hàng (security rule). Mọi hành động ghi audit trong service.
 */
@ApiTags('platform-admin')
@Controller('platform/approvals')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_APPROVAL_REVIEW)
export class PlatformAdminController {
  constructor(private readonly approvals: PlatformApprovalService) {}

  @Get()
  @ApiOperation({ summary: 'Hàng đợi phiếu duyệt (phân trang, lọc theo trạng thái/loại)' })
  @ApiOkResponse({ type: ApprovalTaskPageDto })
  list(@Query() query: ApprovalListQueryDto): Promise<ApprovalTaskPageDto> {
    return this.approvals.list(query) as Promise<ApprovalTaskPageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết phiếu duyệt (hồ sơ snapshot + lịch sử)' })
  @ApiOkResponse({ type: ApprovalTaskDetailDto })
  getOne(@Param('id') id: string): Promise<ApprovalTaskDetailDto> {
    return this.approvals.getTask(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duyệt phiếu (gian hàng → hoạt động)' })
  @ApiOkResponse({ type: ApprovalTaskDetailDto })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewActionDto,
  ): Promise<ApprovalTaskDetailDto> {
    return this.approvals.approve(id, user.id, dto.reason);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối phiếu (cần lý do)' })
  @ApiOkResponse({ type: ApprovalTaskDetailDto })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewActionDto,
  ): Promise<ApprovalTaskDetailDto> {
    return this.approvals.reject(id, user.id, dto.reason);
  }

  @Post(':id/request-revision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu bổ sung (cần lý do)' })
  @ApiOkResponse({ type: ApprovalTaskDetailDto })
  requestRevision(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewActionDto,
  ): Promise<ApprovalTaskDetailDto> {
    return this.approvals.requestRevision(id, user.id, dto.reason);
  }
}
