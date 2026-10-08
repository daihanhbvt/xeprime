import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUDIT_ACTION_CATEGORY_VALUES,
  AUDIT_ACTOR_SCOPE_VALUES,
  type AuditActionCategory,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as AUDIT_LOG_DEFAULT_LIMIT, MAX_LIMIT as AUDIT_LOG_MAX_LIMIT };

/** Lọc nhật ký hệ thống (admin nền tảng). Mọi filter là AND; action so khớp CHÍNH XÁC. */
export class AuditLogListQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_ACTOR_SCOPE_VALUES })
  @IsOptional()
  @IsIn(AUDIT_ACTOR_SCOPE_VALUES)
  actorScope?: string;

  @ApiPropertyOptional({ description: 'Khớp chính xác, vd "tenant.lock"' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @ApiPropertyOptional({
    enum: AUDIT_ACTION_CATEGORY_VALUES,
    description: 'Nhóm hành động — suy từ tiền tố mã (auditActionCategoryOf), lọc ở DB',
  })
  @IsOptional()
  @IsIn(AUDIT_ACTION_CATEGORY_VALUES)
  category?: AuditActionCategory;

  @ApiPropertyOptional({
    description:
      'Tìm kiếm: một ULID khớp chính xác mã dòng / đối tượng / gian hàng / tài khoản; chữ thường ' +
      'khớp tên-email người thực hiện hoặc tên-mã gian hàng',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Loại đối tượng, vd "tenant" / "booking"' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetType?: string;

  @ApiPropertyOptional({ description: 'ID đối tượng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  targetId?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo người thao tác (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  actorUserId?: string;

  @ApiPropertyOptional({ description: 'Từ thời điểm (ISO-8601, inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Đến thời điểm (ISO-8601, inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/**
 * Một dòng nhật ký trong danh sách — KHÔNG kèm before/after JSON (payload nặng, drawer lấy
 * riêng qua GET :id).
 */
export class AuditLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AUDIT_ACTOR_SCOPE_VALUES }) actorScope!: string;
  @ApiProperty() action!: string;
  @ApiProperty() targetType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) targetId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Tên người đọc được của đối tượng (tên gói, biển số, mã đơn…) — null khi loại đối tượng không ' +
      'tra nhãn (dữ liệu cá nhân) hoặc bản ghi không còn',
  })
  targetLabel!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ipAddress!: string | null;
  @ApiProperty({ description: 'Nhân sự nền tảng thực hiện TRONG một phiên hỗ trợ (ADR 0050)' })
  viaSupport!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogDto] }) data!: AuditLogDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Chi tiết một dòng nhật ký (drawer) — kèm snapshot before/after. */
export class AuditLogDetailDto extends AuditLogDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  beforeJson!: unknown;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  afterJson!: unknown;

  @ApiPropertyOptional({ type: String, nullable: true }) userAgent!: string | null;
}
