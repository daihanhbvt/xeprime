import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION, SUPPORT_PARTY, type SupportCaseStatus } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  AssignSupportCaseDto,
  PostSupportEventDto,
  ResolveSupportCaseDto,
  SupportCaseDetailDto,
  SupportCaseListQueryDto,
  SupportCasePageDto,
  TransitionSupportCaseDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

/**
 * Hỗ trợ / tranh chấp — bề mặt của NỀN TẢNG (R3, ADR 0028 release gate 7).
 *
 * Đây là bên duy nhất KẾT LUẬN được một tranh chấp, và kết luận đó mở khoá việc chốt kết cục
 * khoản giữ chỗ (`POST /platform/money/holds/:id/settle`). Hai bước tách rời có chủ đích: kết
 * luận là phán xét, chốt tiền là thao tác kế toán — trộn lại thì một cú bấm vừa phân xử vừa
 * chuyển tiền mà không ai đối chiếu được.
 */
@ApiTags('platform-support')
@Controller('platform/support/cases')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_SUPPORT_MANAGE)
export class PlatformSupportController {
  constructor(private readonly support: SupportService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.id, scope: SUPPORT_PARTY.PLATFORM, tenantId: null } as const;
  }

  @Get()
  @ApiOperation({ summary: 'Hàng đợi toàn sàn — ưu tiên cao trước, rồi cũ nhất trước' })
  @ApiOkResponse({ type: SupportCasePageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupportCaseListQueryDto,
  ): Promise<SupportCasePageDto> {
    return this.support.list(this.actor(user), query) as Promise<SupportCasePageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết + dòng thời gian ĐẦY ĐỦ (gồm ghi chú nội bộ)' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupportCaseDetailDto> {
    return this.support.detail(id, this.actor(user));
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trả lời; `internal=true` là ghi chú nội bộ hai bên KHÔNG thấy' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  message(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PostSupportEventDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.postMessage(id, this.actor(user), dto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Phân công + đặt mức ưu tiên (nhận việc thì case sang đang xử lý)' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  assign(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.assign(id, user.id, dto);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi trạng thái theo máy trạng thái của case' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  transition(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransitionSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.transition(
      id,
      this.actor(user),
      dto.status as SupportCaseStatus,
      dto.note ?? null,
    );
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kết luận. Với tranh chấp: sau bước này mới chốt được kết cục khoản giữ chỗ',
  })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolveSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.resolve(id, user.id, dto.resolution);
  }
}
