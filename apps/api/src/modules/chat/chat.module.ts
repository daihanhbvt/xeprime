import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ChatController } from './chat.controller';
import { ConversationsController } from './conversations.controller';
import { ChatService } from './chat.service';
import { ChatReportReasonsService } from './chat-report-reasons.service';

/**
 * Chat (Phase 5, ADR 0009). PostgreSQL là source of truth; realtime đẩy qua outbox → worker →
 * Firestore. FirebaseAppService (@Global) mint custom token; R2Service (StorageModule) presign
 * đính kèm. PrismaService/ConfigService/NotificationService là global nên không cần import.
 */
@Module({
  imports: [StorageModule],
  controllers: [ConversationsController, ChatController],
  providers: [ChatService, ChatReportReasonsService],
  exports: [ChatService, ChatReportReasonsService],
})
export class ChatModule {}
