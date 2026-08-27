import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ChatUnreadCountDto,
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
 */
@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách hội thoại của tôi (phân trang)' })
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

  @Get('unread-count')
  @ApiOperation({ summary: 'Tổng tin chưa đọc mọi hội thoại (cho badge icon chat)' })
  @ApiOkResponse({ type: ChatUnreadCountDto })
  unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<ChatUnreadCountDto> {
    return this.chat.unreadCount(user.id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Lịch sử tin nhắn (cursor, mới nhất trước)' })
  @ApiOkResponse({ type: MessagePageDto })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MessageListQueryDto,
  ): Promise<MessagePageDto> {
    return this.chat.listMessages(user.id, id, query) as Promise<MessagePageDto>;
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Gửi một tin nhắn' })
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
