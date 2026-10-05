import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_PARTY,
} from '@xeprime/types';
import { CurrentUser, Realms } from '../../common/decorators';
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
 *
 * ## Tài khoản ĐỐI TÁC dùng được — nhưng chỉ cho yêu cầu xoá tài khoản (05/10/2026)
 *
 * Xoá tài khoản là việc của một CON NGƯỜI trên chính tài khoản của họ, ở realm nào cũng vậy. Từ
 * ADR 0053 tài khoản partner là một tài khoản riêng — và trước bản sửa này nó KHÔNG có đường nào
 * gửi yêu cầu đóng tài khoản của mình: trang tài khoản của site partner gọi đúng endpoint này và
 * nhận 403 lệch realm.
 *
 * Mở realm partner cho cả controller nhưng `open` chặn mọi loại khác `account_deletion`: hỗ trợ
 * vận hành của đối tác đi qua `/support/cases` (phạm vi GIAN HÀNG), không phải hộp thư cá nhân —
 * hai nơi nhận cùng một loại yêu cầu là hai hàng đợi mà nền tảng phải đối chiếu. Đọc/rút/nhắn thêm
 * vẫn chỉ trong phạm vi "case do chính tôi mở", nên với đối tác chúng chỉ chạm được yêu cầu xoá.
 */
@ApiTags('customer-support')
@Controller('me/support/cases')
@Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
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
    // Đối tác: hộp thư cá nhân chỉ nhận yêu cầu xoá tài khoản — xem docblock của controller.
    if (
      user.realm === ACCOUNT_REALM.PARTNER &&
      dto.category !== SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.SUPPORT_CASE_CATEGORY_NOT_ALLOWED,
        message: 'Tài khoản đối tác gửi yêu cầu hỗ trợ ở mục Hỗ trợ của gian hàng',
      });
    }
    return this.support.open(this.actor(user), dto);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rút yêu cầu xoá tài khoản (chỉ case account_deletion còn mở do chính bạn mở)',
  })
  @ApiOkResponse({ type: SupportCaseDetailDto })
  withdraw(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupportCaseDetailDto> {
    return this.support.withdrawAccountDeletion(id, user.id);
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
