import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { BadgesService } from './badges.service';
import { UserBadgesDto } from './dto/badges.dto';

/**
 * Huy hiệu của khung ứng dụng — MỘT request cho mọi con số hiện ở chuông và biểu tượng chat.
 *
 * Vì sao gộp thay vì để từng feature một endpoint: các con số này được hỏi ở MỌI trang, cùng
 * lúc, bởi mọi tab đang mở. Ba endpoint riêng nghĩa là ba lần qua guard xác thực, ba lần tra
 * `users`, và ba lần giải danh sách gian hàng của cùng một người — cho một payload tổng cộng
 * chưa tới trăm byte. Endpoint cũ (`/conversations/unread-*`, `/notifications/unread-count`)
 * vẫn giữ nguyên: app native đang dùng chúng, và chúng vẫn là cách trả lời câu hỏi HẸP.
 *
 * Không có `@RequirePermissions`: đây là dữ liệu của chính người gọi. Phạm vi gian hàng suy từ
 * membership trong DB, nên một người không thuộc gian hàng nào luôn nhận 0 — không có tham số
 * nào để họ khai khác đi.
 */
@ApiTags('badges')
@Controller('me')
export class BadgesController {
  constructor(private readonly badges: BadgesService) {}

  @Get('badges')
  @ApiOperation({ summary: 'Huy hiệu của tôi: chưa đọc ở chuông và hai hộp thư chat' })
  @ApiOkResponse({ type: UserBadgesDto })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<UserBadgesDto> {
    return this.badges.ofUser(user.id);
  }
}
