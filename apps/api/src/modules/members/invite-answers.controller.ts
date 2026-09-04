import { Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { InviteAnswerDto, InvitePreviewDto } from './dto/invite.dto';
import { InvitesService } from './invites.service';

/**
 * Người ĐƯỢC mời trả lời — `/invites/:token`.
 *
 * **KHÔNG `@TenantScoped()`, và không thể**: guard scope đọc membership của người gọi, còn ở
 * đây người gọi chưa là thành viên của gian hàng nào. Đó cũng là lý do ba route này nằm riêng
 * chứ không nhét vào `InvitesController`.
 *
 * Cũng **không có `@RequirePermissions`**: quyền ở đây không đến từ vai trong một gian hàng mà
 * từ việc cầm đúng token VÀ đăng nhập đúng email được mời — `InvitesService.loadAnswerable`
 * kiểm cả hai. Một `members.*` nào đó ở đây sẽ vô nghĩa: người được mời chưa có vai nào cả.
 */
@ApiTags('members')
@Controller('invites')
export class InviteAnswersController {
  constructor(private readonly invites: InvitesService) {}

  /**
   * `@Public` có chủ đích: người được mời thường CHƯA có tài khoản, và họ cần biết ai mời, mời
   * làm gì trước khi quyết định có đăng ký hay không.
   *
   * Cái lộ ra chỉ đủ để quyết định (tên gian hàng, vai trò, hạn, email đã che) và chỉ lộ cho
   * người cầm đúng token 32 byte. Hạn mức chặt để token không dò được bằng cách thử.
   */
  @Get(':token')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Xem trước một lời mời (không cần đăng nhập)' })
  @ApiOkResponse({ type: InvitePreviewDto })
  preview(@Param('token') token: string): Promise<InvitePreviewDto> {
    return this.invites.preview(token);
  }

  @Post(':token/accept')
  @ApiOperation({ summary: 'Đồng ý tham gia gian hàng — cần đăng nhập đúng email được mời' })
  @ApiOkResponse({ type: InviteAnswerDto })
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InviteAnswerDto> {
    return this.invites.accept(token, user.id);
  }

  /**
   * Từ chối cũng cần đăng nhập, dù nghe có vẻ thừa.
   *
   * Nếu ai cầm link cũng từ chối được thì một email chuyển tiếp nhầm đủ để huỷ lời mời của
   * người khác — rẻ tiền nhưng vẫn là chiếm quyền quyết định của họ.
   */
  @Post(':token/decline')
  @ApiOperation({ summary: 'Từ chối lời mời — cần đăng nhập đúng email được mời' })
  @ApiOkResponse({ type: InviteAnswerDto })
  decline(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InviteAnswerDto> {
    return this.invites.decline(token, user.id);
  }
}
