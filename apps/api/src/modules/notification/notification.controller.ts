import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
import {
  DisabledCountDto,
  PushDeviceDto,
  RegisterPushDeviceDto,
  UnregisterPushDeviceDto,
} from './dto/push-device.dto';
import { NotificationService } from './notification.service';
import { PushDeviceService } from './push-device.service';

/**
 * Thông báo in-app — PER-USER, không tenant-scoped: mỗi người chỉ đọc thông báo của chính mình
 * (`userId` lấy từ session, không nhận client). Chỉ cần đăng nhập, không đòi permission riêng.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly devices: PushDeviceService,
  ) {}

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

  /**
   * Idempotent: gọi lại với cùng token chỉ chạm `last_seen_at`. App gọi nó sau mỗi lần đăng
   * nhập và mỗi lần FCM xoay token, nên "gọi nhiều lần" là đường đi thường gặp chứ không phải
   * lỗi của client.
   *
   * Chạy được cả khi `PUSH_ENABLED=false` — thiết bị đăng ký trước, bật sau; trường
   * `pushEnabled` trong response nói rõ server đang ở trạng thái nào.
   */
  @Post('device-token')
  @ApiOperation({ summary: 'Đăng ký thiết bị nhận thông báo đẩy (idempotent)' })
  @ApiOkResponse({ type: PushDeviceDto })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushDeviceDto,
  ): Promise<PushDeviceDto> {
    // `userId`/`sessionId` LUÔN từ phiên, không bao giờ từ body — xem PushDeviceService.
    return this.devices.register(user.id, user.sessionId, dto);
  }

  /**
   * Bỏ trống body = tắt mọi thiết bị của PHIÊN hiện tại. Có `token` = tắt đúng thiết bị đó, và
   * chỉ khi nó thuộc về người đang gọi.
   */
  @Delete('device-token')
  @ApiOperation({ summary: 'Ngừng nhận thông báo đẩy trên thiết bị này' })
  @ApiOkResponse({ type: DisabledCountDto })
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnregisterPushDeviceDto,
  ): Promise<DisabledCountDto> {
    const disabled = dto.token
      ? await this.devices.disableByToken(user.id, dto.token)
      : await this.devices.disableForCurrentSession(user.id, user.sessionId);
    return { disabled };
  }
}
