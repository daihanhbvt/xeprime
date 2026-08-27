import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  NotificationListQueryDto,
  NotificationMarkAllResultDto,
  NotificationPageDto,
  NotificationReadResultDto,
  NotificationUnreadCountDto,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';

/**
 * Thông báo in-app — PER-USER, không tenant-scoped: mỗi người chỉ đọc thông báo của chính mình
 * (`userId` lấy từ session, không nhận client). Chỉ cần đăng nhập, không đòi permission riêng.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo của tôi (phân trang, lọc chưa đọc)' })
  @ApiOkResponse({ type: NotificationPageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(user.id, query) as Promise<NotificationPageDto>;
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc (cho badge chuông)' })
  @ApiOkResponse({ type: NotificationUnreadCountDto })
  unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<NotificationUnreadCountDto> {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  @ApiOkResponse({ type: NotificationReadResultDto })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationReadResultDto> {
    return this.notifications.markRead(user.id, id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Đánh dấu tất cả đã đọc' })
  @ApiOkResponse({ type: NotificationMarkAllResultDto })
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<NotificationMarkAllResultDto> {
    return this.notifications.markAllRead(user.id);
  }
}
