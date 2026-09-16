import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ChatInbox } from '@xeprime/types';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ChatEligibilityDto,
  ChatEligibilityQueryDto,
  ChatInboxQueryDto,
  ChatUnreadCountDto,
  ChatUnreadSummaryDto,
  ConversationListQueryDto,
  ConversationPageDto,
  ConversationSummaryDto,
  CreateConversationDto,
  MarkReadResultDto,
  MessageDto,
  MessageListQueryDto,
  MessagePageDto,
  SendMessageDto,
} from './dto/chat.dto';
import { ChatService } from './chat.service';

/**
 * Hội thoại chat — PER-USER theo participant (không tenant-scoped): phục vụ cả shop lẫn khách,
 * quyền do ChatService kiểm (customer sở hữu / thành viên active của tenant). `userId` từ session.
 *
 * `side` là tham số BẮT BUỘC của mọi bề mặt đọc, và nhận ba giá trị (`CHAT_INBOX`). Một tài
 * khoản có thể vừa thuê xe của gian hàng khác vừa là nhân viên gian hàng mình; hai vai đó là hai
 * phạm vi, và tham số bắt buộc là cách để server không phải TỰ ĐOÁN phạm vi của một truy vấn về
 * dữ liệu riêng tư.
 *
 * `unified` (16/09/2026) là HỢP của đúng hai phạm vi người gọi đã có — không mở thêm hội thoại
 * nào, và quyền đọc từng hội thoại vẫn do `resolveAccess` quyết. Nó tồn tại cho chủ xe tuyến hoa
 * hồng: họ không có cổng `/manage` để đặt hộp thư công việc, nên với họ "tin nhắn" là MỘT khái
 * niệm (ADR 0038 điều 9).
 */
@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Hộp thư của một bề mặt (khách hoặc gian hàng), phân trang' })
  @ApiOkResponse({ type: ConversationPageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConversationListQueryDto,
  ): Promise<ConversationPageDto> {
    return this.chat.listConversations(user.id, query) as Promise<ConversationPageDto>;
  }

  @Post()
  @ApiOperation({ summary: 'Mở/lấy hội thoại với shop về một xe (khách)' })
  @ApiCreatedResponse({ type: ConversationSummaryDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationSummaryDto> {
    return this.chat.getOrCreateConversation(user.id, dto);
  }

  /**
   * ĐỨNG TRƯỚC `@Get(':id')` — Nest khớp route theo thứ tự khai báo, nên đặt sau thì
   * `eligibility` bị nuốt thành một id hội thoại.
   */
  @Get('eligibility')
  @ApiOperation({ summary: 'Khách có nhắn được cho gian hàng này không (để ẩn/hiện nút)' })
  @ApiOkResponse({ type: ChatEligibilityDto })
  async eligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ChatEligibilityQueryDto,
  ): Promise<ChatEligibilityDto> {
    return { canChat: await this.chat.chatEligibilityForShop(user.id, query.shopSlug) };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Tổng tin chưa đọc của một bề mặt (cho badge icon chat)' })
  @ApiOkResponse({ type: ChatUnreadCountDto })
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ChatInboxQueryDto,
  ): Promise<ChatUnreadCountDto> {
    return this.chat.unreadCount(user.id, query.side as ChatInbox);
  }

  /**
   * ĐỨNG TRƯỚC `@Get(':id')` — Nest khớp route theo thứ tự khai báo, nên đặt sau thì
   * `unread-summary` sẽ bị nuốt thành một `:id`.
   */
  @Get('unread-summary')
  @ApiOperation({ summary: 'Chưa đọc của cả hai vai — cho badge biểu tượng chat ở mọi trang' })
  @ApiOkResponse({ type: ChatUnreadSummaryDto })
  unreadSummary(@CurrentUser() user: AuthenticatedUser): Promise<ChatUnreadSummaryDto> {
    return this.chat.unreadSummary(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Một hội thoại theo id — mở deep link không nằm ở trang đầu' })
  @ApiOkResponse({ type: ConversationSummaryDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ChatInboxQueryDto,
  ): Promise<ConversationSummaryDto> {
    return this.chat.getConversation(user.id, id, query.side as ChatInbox);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Lịch sử tin nhắn (cursor keyset, mới nhất trước)' })
  @ApiOkResponse({ type: MessagePageDto })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MessageListQueryDto,
  ): Promise<MessagePageDto> {
    return this.chat.listMessages(user.id, id, query) as Promise<MessagePageDto>;
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Gửi một tin nhắn (idempotent theo clientMessageId)' })
  @ApiCreatedResponse({ type: MessageDto })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chat.sendMessage(user.id, id, dto);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Đánh dấu đã đọc hội thoại' })
  @ApiOkResponse({ type: MarkReadResultDto })
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarkReadResultDto> {
    return this.chat.markRead(user.id, id);
  }
}
