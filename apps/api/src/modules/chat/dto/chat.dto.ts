import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_TYPE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MESSAGE_DEFAULT_LIMIT = 30;
const MESSAGE_MAX_LIMIT = 50;
const CONVERSATION_DEFAULT_LIMIT = 20;
const CONVERSATION_MAX_LIMIT = 50;

export {
  MESSAGE_DEFAULT_LIMIT,
  MESSAGE_MAX_LIMIT,
  CONVERSATION_DEFAULT_LIMIT,
  CONVERSATION_MAX_LIMIT,
};

/** Khách mở/lấy hội thoại với shop về một xe. Backend suy tenant từ xe. */
export class CreateConversationDto {
  @ApiProperty({ description: 'ID xe (listing) muốn nhắn shop' })
  @IsString()
  vehicleId!: string;
}

export class ConversationListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: CONVERSATION_DEFAULT_LIMIT, minimum: 1, maximum: CONVERSATION_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

/** Đính kèm client đã upload thẳng lên R2 (qua presign), giờ tham chiếu khi gửi tin. */
export class AttachmentInputDto {
  @ApiProperty({ description: 'URL công khai R2 (phải thuộc R2_PUBLIC_BASE_URL)' })
  @IsString()
  @MaxLength(1000)
  url!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fileType?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;
}

export class SendMessageDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  // KHÔNG đặt `default` ở đây: openapi-typescript coi property có default là bắt buộc (default
  // non-nullable) → FE phải luôn gửi. Server tự suy messageType khi client bỏ trống.
  @ApiPropertyOptional({ enum: MESSAGE_TYPE_VALUES })
  @IsOptional()
  @IsIn(MESSAGE_TYPE_VALUES)
  messageType?: string;

  @ApiPropertyOptional({ type: [AttachmentInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];
}

export class MessageListQueryDto {
  @ApiPropertyOptional({ description: 'Cursor: lấy tin CŨ hơn mốc ISO này (phân trang lịch sử)' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ default: MESSAGE_DEFAULT_LIMIT, minimum: 1, maximum: MESSAGE_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class PresignAttachmentDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: 'MIME type', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  contentType!: string;
}

// --- Response DTOs ---------------------------------------------------------

export class ConversationSummaryDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleName!: string | null;
  @ApiProperty({ description: 'Tên phía bên kia (khách thấy tên shop, shop thấy tên khách)' })
  partyName!: string;
  @ApiProperty({ description: 'side của người xem: customer | shop' }) side!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) lastMessageText!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  lastMessageAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastSenderType!: string | null;
  @ApiProperty({ description: 'Số tin chưa đọc của phía người xem' }) unread!: number;
  @ApiProperty() status!: string;
}

export class ConversationPageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() hasNext!: boolean;
}

export class ConversationPageDto {
  @ApiProperty({ type: [ConversationSummaryDto] }) data!: ConversationSummaryDto[];
  @ApiProperty({ type: ConversationPageMetaDto }) meta!: ConversationPageMetaDto;
}

export class MessageAttachmentDto {
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) fileType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fileName!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) fileSize!: number | null;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) senderUserId!: string | null;
  @ApiProperty() senderType!: string;
  @ApiProperty() messageType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) text!: string | null;
  @ApiProperty({ type: [MessageAttachmentDto] }) attachments!: MessageAttachmentDto[];
  @ApiProperty({ description: 'ISO-8601 UTC' }) sentAt!: string;
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageDto], description: 'Mới nhất trước' }) data!: MessageDto[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Cursor cho lần tải cũ hơn' })
  nextBefore!: string | null;
}

export class MarkReadResultDto {
  @ApiProperty() conversationId!: string;
  @ApiProperty({ example: 0 }) unread!: number;
}

export class FirebaseTokenDto {
  @ApiProperty({ description: 'Bật realtime chat không' }) enabled!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Custom token để signInWithCustomToken' })
  token!: string | null;
}

export class PresignResultDto {
  @ApiProperty() key!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty() publicUrl!: string;
  @ApiProperty() expiresIn!: number;
}
