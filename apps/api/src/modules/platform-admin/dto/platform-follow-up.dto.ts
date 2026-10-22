import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CANCELLATION_PARTY_VALUES,
  CANCELLATION_REASON_CATEGORY_VALUES,
  FOLLOW_UP_LOST_REASON_VALUES,
  FOLLOW_UP_NOTE_MAX_LENGTH,
  FOLLOW_UP_STATUS_VALUES,
  PLATFORM_ROLE_VALUES,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const PLATFORM_FOLLOW_UP_DEFAULT_LIMIT = 20;
export const PLATFORM_FOLLOW_UP_MAX_LIMIT = 100;

/** Lọc tab "Cần chăm sóc" (ADR 0070). Mọi filter là AND. */
export class PlatformFollowUpListQueryDto {
  @ApiPropertyOptional({ enum: FOLLOW_UP_LOST_REASON_VALUES })
  @IsOptional()
  @IsIn(FOLLOW_UP_LOST_REASON_VALUES)
  reason?: string;

  @ApiPropertyOptional({ enum: FOLLOW_UP_STATUS_VALUES })
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUS_VALUES)
  followUpStatus?: string;

  @ApiPropertyOptional({ description: 'Chỉ mục giao cho tôi' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ description: 'Tên khách / mã đơn / tên xe' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Tra CHÍNH XÁC theo SĐT khách' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Kết thúc từ ngày (YYYY-MM-DD, giờ VN)' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Kết thúc tới hết ngày (YYYY-MM-DD, giờ VN)' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  dateTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: PLATFORM_FOLLOW_UP_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PLATFORM_FOLLOW_UP_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PLATFORM_FOLLOW_UP_MAX_LIMIT)
  limit?: number;
}

export class PlatformFollowUpCancellationDto {
  @ApiProperty({ enum: CANCELLATION_PARTY_VALUES }) responsibleParty!: string;
  @ApiProperty({ enum: CANCELLATION_REASON_CATEGORY_VALUES }) reasonCategory!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) cancelledAt!: string;
}

/** Một khách mất đơn. SĐT luôn ĐÃ CHE — bản đầy đủ qua `POST …/:id/contact` (quyền PII + audit). */
export class PlatformFollowUpDto {
  @ApiProperty({ description: 'Id yêu cầu thuê' }) id!: string;
  @ApiProperty({ enum: FOLLOW_UP_LOST_REASON_VALUES }) lostReason!: string;
  @ApiProperty({ description: 'Trạng thái yêu cầu thuê' }) requestStatus!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che' })
  customerPhoneMasked!: string | null;
  @ApiProperty({ type: String, nullable: true }) customerUserId!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) pickupAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) returnAt!: string | null;
  @ApiProperty({ description: 'Lúc gửi yêu cầu, ISO-8601 UTC' }) requestedAt!: string;
  @ApiProperty({ description: 'Lúc kết thúc (lần đổi trạng thái cuối), ISO-8601 UTC' })
  closedAt!: string;
  @ApiProperty({ type: PlatformFollowUpCancellationDto, nullable: true })
  cancellation!: PlatformFollowUpCancellationDto | null;
  @ApiProperty({ description: 'Khách đã có đơn khác SAU yêu cầu này' }) rebookedLater!: boolean;
  @ApiProperty({ enum: FOLLOW_UP_STATUS_VALUES }) followUpStatus!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) assigneeUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) assigneeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastContactedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) followUpUpdatedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) followUpUpdatedByName!: string | null;
}

export class PlatformFollowUpPageDto {
  @ApiProperty({ type: [PlatformFollowUpDto] }) data!: PlatformFollowUpDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class UpdateFollowUpDto {
  @ApiProperty({ enum: FOLLOW_UP_STATUS_VALUES })
  @IsIn(FOLLOW_UP_STATUS_VALUES)
  status!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: FOLLOW_UP_NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(FOLLOW_UP_NOTE_MAX_LENGTH)
  note?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Người phụ trách — tài khoản nền tảng; null để bỏ giao',
  })
  @IsOptional()
  @IsString()
  @MinLength(26)
  @MaxLength(26)
  assigneeUserId?: string | null;

  @ApiPropertyOptional({
    description:
      'Trạng thái "đã gọi cho khách": `true` ghi mốc liên hệ (giữ mốc cũ nếu đã có), `false` xoá mốc, bỏ trống = không đổi',
  })
  @IsOptional()
  @IsBoolean()
  markContacted?: boolean;
}

export class FollowUpContactDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerPhone!: string;
  @ApiProperty({ type: String, nullable: true }) customerEmail!: string | null;
}

/** Một nhân sự giao được làm phụ trách chăm sóc khách. */
export class FollowUpAssigneeDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({
    enum: PLATFORM_ROLE_VALUES,
    description: 'Vai trò nền tảng — để phân biệt với tên hiển thị',
  })
  roleKey!: string;
}
