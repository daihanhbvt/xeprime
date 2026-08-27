import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PLAN_STATUS_VALUES, SUBSCRIPTION_STATUS_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as SUBSCRIPTION_DEFAULT_LIMIT, MAX_LIMIT as SUBSCRIPTION_MAX_LIMIT };

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export class PlanListQueryDto {
  @ApiPropertyOptional({ enum: PLAN_STATUS_VALUES, description: 'Bỏ trống = chỉ gói đang bán' })
  @IsOptional()
  @IsIn([...PLAN_STATUS_VALUES, 'all'])
  status?: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'basic', description: 'Mã gói — unique, không đổi sau khi tạo' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,49}$/, {
    message: 'code chỉ gồm chữ thường/số/gạch, 2-50 ký tự',
  })
  code!: string;

  @ApiProperty({ example: 'Gói Cơ bản' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Giá một chu kỳ, string thập phân — ADR 0007', example: '500000' })
  @Matches(MONEY_PATTERN, { message: 'price phải là số tiền hợp lệ' })
  price!: string;

  @ApiProperty({ description: 'Số ngày một chu kỳ', example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3660)
  durationDays!: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Giới hạn số xe; null/bỏ trống = không giới hạn (ADR 0010)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVehicles?: number | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** Sửa gói — không đổi `code` (định danh); giá mới chỉ áp cho lượt gán sau (price snapshot). */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Tiền dạng string — ADR 0007' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'price phải là số tiền hợp lệ' })
  price?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3660)
  durationDays?: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = bỏ giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVehicles?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class PlanDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) price!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() durationDays!: number;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  maxVehicles!: number | null;
  @ApiProperty({ enum: PLAN_STATUS_VALUES }) status!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Số thuê bao đã gán từ gói này (mọi trạng thái)' })
  subscriptionCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export class SubscriptionListQueryDto {
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

/** Gán/gia hạn gói: chu kỳ mới nối đuôi gói hiện hành (còn hạn) hoặc bắt đầu từ bây giờ. */
export class AssignSubscriptionDto {
  @ApiProperty({ description: 'ID gói (ULID)' })
  @IsString()
  @Length(26, 26)
  planId!: string;

  @ApiPropertyOptional({ description: 'Ghi chú (số chứng từ, lý do tặng…)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SubscriptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty({
    enum: SUBSCRIPTION_STATUS_VALUES,
    description: 'Lưu active|cancelled; expired suy ra từ endsAt (ADR 0010)',
  })
  status!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) price!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) startsAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) endsAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class SubscriptionPageDto {
  @ApiProperty({ type: [SubscriptionDto] }) data!: SubscriptionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Gói hiện hành của tenant — nhúng vào PlatformTenantDetailDto. */
export class CurrentPlanDto {
  @ApiProperty() subscriptionId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxVehicles!: number | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) endsAt!: string;
}
