import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_COUNT,
  CHAT_ATTACHMENT_MIME_TYPES,
  CHAT_SIDE_VALUES,
  MESSAGE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MESSAGE_DEFAULT_LIMIT = 30;
const MESSAGE_MAX_LIMIT = 50;
const CONVERSATION_DEFAULT_LIMIT = 20;
const CONVERSATION_MAX_LIMIT = 50;

// Trần dung lượng, bộ MIME và số tệp tối đa đều đến từ `@xeprime/types` — MỘT định nghĩa cho cả
// backend lẫn client; xem docblock của `CHAT_ATTACHMENT_MIME_TYPES`.
const ATTACHMENT_MIME_TYPES: readonly string[] = CHAT_ATTACHMENT_MIME_TYPES;

export {
  MESSAGE_DEFAULT_LIMIT,
  MESSAGE_MAX_LIMIT,
  CONVERSATION_DEFAULT_LIMIT,
  CONVERSATION_MAX_LIMIT,
  ATTACHMENT_MIME_TYPES,
};

/** `?flag=true|1` → boolean. Query string không có kiểu, `Type(() => Boolean)` biến `'false'` thành `true`. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' || value === '1' : Boolean(value),
  );

/** Khách mở/lấy hội thoại với shop về một xe. Backend suy tenant từ xe. */
export class CreateConversationDto {
  @ApiProperty({ description: 'ID xe (listing) muốn nhắn shop' })
  @IsString()
  vehicleId!: string;
}

/**
 * Bề mặt chat mà người gọi đang đứng — BẮT BUỘC, không có mặc định.
 *
 * Một tài khoản vừa là khách vừa là nhân viên gian hàng có hai hộp thư khác nhau; một tham số
 * tuỳ chọn nghĩa là ai đó quên truyền và nhận về danh sách trộn của cả hai vai.
 */
export class ChatSideQueryDto {
  @ApiProperty({ enum: CHAT_SIDE_VALUES, description: 'customer = hộp thư khách · shop = inbox gian hàng' })
  @IsIn(CHAT_SIDE_VALUES)
  side!: string;
}

export class ConversationListQueryDto extends ChatSideQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: CONVERSATION_DEFAULT_LIMIT,
    minimum: 1,
    maximum: CONVERSATION_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Tìm theo tên phía bên kia hoặc tên xe', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Chỉ hội thoại còn tin chưa đọc' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  unreadOnly?: boolean;
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

  /**
   * Khoá chống-gửi-trùng do client sinh (ULID). Gửi lại cùng khoá trả về ĐÚNG tin đã lưu thay vì
   * tạo tin thứ hai — bảo đảm bằng unique DB `(conversation_id, client_message_id)`.
   */
  @ApiPropertyOptional({ description: 'ULID client sinh; gửi lại cùng khoá là idempotent', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'clientMessageId chỉ gồm chữ, số, gạch ngang, gạch dưới' })
  clientMessageId?: string;

  /**
   * Xe mà tin nhắn này NÓI VỀ — thẻ ngữ cảnh hiện kèm bong bóng.
   *
   * Client gửi kèm ở câu ĐẦU TIÊN sau khi mở chat từ một tin đăng. Server kiểm xe có thuộc gian
   * hàng của hội thoại không; không hợp lệ thì bỏ thẻ chứ không chặn tin.
   */
  @ApiPropertyOptional({ description: 'ID xe làm ngữ cảnh cho tin nhắn này' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  vehicleId?: string;

  @ApiPropertyOptional({ type: [AttachmentInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHAT_ATTACHMENT_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];
}

export class MessageListQueryDto {
  @ApiPropertyOptional({ description: 'Cursor: lấy tin CŨ hơn mốc ISO này (phân trang lịch sử)' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  /**
   * Nửa còn lại của cursor. Hai tin cùng mili-giây là chuyện thường (một lần gửi kèm nhiều ảnh),
   * và `before` một mình khi đó vừa bỏ sót vừa trả trùng — keyset phải so cả `id`.
   */
  @ApiPropertyOptional({ description: 'Nửa thứ hai của cursor: id của tin cũ nhất trang trước' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  beforeId?: string;

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
  @IsIn(ATTACHMENT_MIME_TYPES)
  contentType!: string;

  /**
   * Số byte client sắp gửi. CHỈ để chặn trần trước khi ký — cố ý KHÔNG ký vào URL: native nén ảnh
   * giữa lúc chọn và lúc PUT, và một `Content-Length` đã ký lệch một byte là 403 ở R2 trông y hệt
   * lỗi CORS (bẫy đã ghi ở `skills/mobile-feature` §3B).
   */
  @ApiProperty({ description: 'Kích thước file (byte)', maximum: CHAT_ATTACHMENT_MAX_BYTES })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize!: number;
}

// --- Response DTOs ---------------------------------------------------------

export class ConversationSummaryDto {
  @ApiProperty() id!: string;
  /*
   * Ba trường dưới đây mô tả xe được NHẮC TỚI GẦN NHẤT, không phải "xe của hội thoại".
   *
   * Từ 08/09/2026 danh tính hội thoại là (khách, gian hàng), nên một thread nói về nhiều xe.
   * Chúng chỉ để hiện dòng phụ ở danh sách ("lần cuối đang bàn về chiếc nào"); ngữ cảnh thật của
   * từng câu nằm ở `MessageDto.vehicle`.
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Xe được nhắc gần nhất' })
  vehicleId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ảnh đại diện xe (R2)' })
  vehicleImageUrl!: string | null;
  @ApiProperty({ description: 'Tên phía bên kia (khách thấy tên shop, shop thấy tên khách)' })
  partyName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Avatar phía bên kia' })
  partyAvatarUrl!: string | null;
  @ApiProperty({ description: 'side của người xem: customer | shop', enum: CHAT_SIDE_VALUES })
  side!: string;
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

/** Thẻ xe đính kèm một tin nhắn — bấm vào mở tin đăng. */
export class MessageVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl!: string | null;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) senderUserId!: string | null;
  /**
   * Tên người gửi THẬT — để inbox gian hàng nói được "Minh trả lời lúc 10:24" khi nhiều nhân
   * viên cùng trực một hội thoại. `null` với tin hệ thống.
   */
  @ApiPropertyOptional({ type: String, nullable: true }) senderName!: string | null;
  @ApiProperty() senderType!: string;
  @ApiProperty() messageType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) text!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Khoá idempotency client gửi kèm — client dùng để khớp tin lạc quan với tin thật',
  })
  clientMessageId!: string | null;
  @ApiPropertyOptional({
    type: MessageVehicleDto,
    nullable: true,
    description: 'Xe tin nhắn này nói về — null khi câu đó không gắn ngữ cảnh nào',
  })
  vehicle!: MessageVehicleDto | null;
  @ApiProperty({ type: [MessageAttachmentDto] }) attachments!: MessageAttachmentDto[];
  @ApiProperty({ description: 'ISO-8601 UTC' }) sentAt!: string;
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageDto], description: 'Mới nhất trước' }) data!: MessageDto[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Cursor cho lần tải cũ hơn' })
  nextBefore!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Nửa thứ hai của cursor' })
  nextBeforeId!: string | null;
}

export class MarkReadResultDto {
  @ApiProperty() conversationId!: string;
  @ApiProperty({ example: 0 }) unread!: number;
}

export class ChatUnreadCountDto {
  @ApiProperty({ example: 3, description: 'Tổng tin chưa đọc mọi hội thoại (phía người xem)' })
  count!: number;
}

export class ChatUnreadSummaryDto {
  @ApiProperty({ example: 2, description: 'Chưa đọc ở hộp thư KHÁCH' }) customer!: number;
  @ApiProperty({ example: 5, description: 'Chưa đọc ở inbox GIAN HÀNG (0 nếu không thuộc shop nào)' })
  shop!: number;
  @ApiProperty({ example: 7, description: 'Tổng hai vai — con số cho badge biểu tượng chat' })
  total!: number;
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
