import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SUPPORT_CASE_CATEGORY_VALUES,
  SUPPORT_CASE_EVENT_KIND_VALUES,
  SUPPORT_CASE_PRIORITY_VALUES,
  SUPPORT_CASE_STATUS_VALUES,
  SUPPORT_PARTY_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const SUPPORT_DEFAULT_LIMIT = 20;
export const SUPPORT_MAX_LIMIT = 100;

export class OpenSupportCaseDto {
  @ApiProperty({ enum: SUPPORT_CASE_CATEGORY_VALUES })
  @IsIn(SUPPORT_CASE_CATEGORY_VALUES)
  category!: string;

  @ApiProperty({ example: 'Xe giao không đúng mô tả' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đơn thuê liên quan — bắt buộc với `dispute` (tranh chấp phải gắn một chuyến)',
  })
  @IsOptional()
  @IsString()
  bookingId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Yêu cầu thuê liên quan' })
  @IsOptional()
  @IsString()
  bookingRequestId?: string | null;
}

export class PostSupportEventDto {
  @ApiProperty({ description: 'Nội dung tin nhắn' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({
    description:
      'Ghi chú NỘI BỘ (chỉ nhân sự nền tảng thấy). Bị bỏ qua với người gửi không phải platform.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  internal?: string;
}

export class ResolveSupportCaseDto {
  @ApiProperty({ description: 'Kết luận — người mở case đọc câu này' })
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  resolution!: string;
}

export class TransitionSupportCaseDto {
  @ApiProperty({ enum: SUPPORT_CASE_STATUS_VALUES })
  @IsIn(SUPPORT_CASE_STATUS_VALUES)
  status!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class AssignSupportCaseDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Nhân sự nền tảng phụ trách; null = bỏ phân công',
  })
  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @ApiPropertyOptional({ enum: SUPPORT_CASE_PRIORITY_VALUES })
  @IsOptional()
  @IsIn(SUPPORT_CASE_PRIORITY_VALUES)
  priority?: string;
}

export class SupportCaseEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SUPPORT_CASE_EVENT_KIND_VALUES }) kind!: string;
  @ApiProperty({ enum: SUPPORT_PARTY_VALUES }) actorScope!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({ description: 'public | internal' }) visibility!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) body!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) toStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) attachmentName!: string | null;
  @ApiProperty() createdAt!: string;
}

export class SupportCaseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã người dùng đọc/nhắc qua điện thoại' }) code!: string;
  @ApiProperty({ enum: SUPPORT_CASE_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ enum: SUPPORT_CASE_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SUPPORT_CASE_PRIORITY_VALUES }) priority!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingRequestId!: string | null;
  @ApiProperty({ enum: SUPPORT_PARTY_VALUES }) openedByScope!: string;
  @ApiProperty() openedByName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) assigneeName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolution!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) closedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class SupportCaseDetailDto extends SupportCaseDto {
  @ApiProperty({ type: [SupportCaseEventDto], description: 'Dòng thời gian — append-only' })
  events!: SupportCaseEventDto[];
}

export class SupportCasePageDto {
  @ApiProperty({ type: [SupportCaseDto] }) data!: SupportCaseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class SupportCaseListQueryDto {
  @ApiPropertyOptional({ enum: SUPPORT_CASE_STATUS_VALUES, description: 'Bỏ trống = case còn MỞ' })
  @IsOptional()
  @IsIn(SUPPORT_CASE_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: SUPPORT_CASE_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(SUPPORT_CASE_CATEGORY_VALUES)
  category?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã case / tiêu đề' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: SUPPORT_DEFAULT_LIMIT, minimum: 1, maximum: SUPPORT_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SUPPORT_MAX_LIMIT)
  limit?: number;
}
