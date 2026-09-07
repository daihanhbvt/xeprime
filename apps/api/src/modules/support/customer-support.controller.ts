import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SUPPORT_PARTY } from '@xeprime/types';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  OpenSupportCaseDto,
  PostSupportEventDto,
  SupportCaseDetailDto,
  SupportCaseListQueryDto,
  SupportCasePageDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

/**
 * Hỗ trợ / tranh chấp — bề mặt của KHÁCH THUÊ (R3).
 *
 * KHÔNG `@TenantScoped` và KHÔNG permission tenant: khách không thuộc gian hàng nào. Phạm vi đọc
 * là "case do chính tôi mở" (`SupportService.scopeWhere`), nằm TRONG truy vấn chứ không phải một
 * câu `if` sau khi đọc — cùng kỷ luật với `CustomerTripsService`.
 */
@ApiTags('customer-support')
@Controller('me/support/cases')
export class CustomerSupportController {
  constructor(private readonly support: SupportService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.id, scope: SUPPORT_PARTY.CUSTOMER, tenantId: null } as const;
  }

  @Get()
  @ApiOperation({ summary: 'Yêu cầu hỗ trợ của tôi — mặc định chỉ case còn mở' })
  @ApiOkResponse({ type: SupportCasePageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupportCaseListQueryDto,
  ): Promise<SupportCasePageDto> {
    return this.support.list(this.actor(user), query) as Promise<SupportCasePageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết + dòng thời gian' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupportCaseDetailDto> {
    return this.support.detail(id, this.actor(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mở yêu cầu hỗ trợ. Tranh chấp phải gắn một chuyến CỦA CHÍNH BẠN và sẽ tạm giữ tiền',
  })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenSupportCaseDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.open(this.actor(user), dto);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gửi thêm thông tin / bằng chứng dạng văn bản' })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  message(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PostSupportEventDto,
  ): Promise<SupportCaseDetailDto> {
    return this.support.postMessage(id, this.actor(user), dto);
  }
}
