import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPROVAL_ACTION_VALUES,
  APPROVAL_STATUS_VALUES,
  APPROVAL_TARGET_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const APPROVAL_DEFAULT_LIMIT = 20;
export const APPROVAL_MAX_LIMIT = 100;

export class ApprovalListQueryDto {
  @ApiPropertyOptional({ enum: APPROVAL_STATUS_VALUES, default: 'pending' })
  @IsOptional()
  @IsIn(APPROVAL_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: APPROVAL_TARGET_TYPE_VALUES })
  @IsOptional()
  @IsIn(APPROVAL_TARGET_TYPE_VALUES)
  targetType?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: APPROVAL_DEFAULT_LIMIT, minimum: 1, maximum: APPROVAL_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(APPROVAL_MAX_LIMIT)
  limit?: number;
}

export class ApprovalTaskListItemDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantName!: string | null;
  @ApiProperty({ enum: APPROVAL_TARGET_TYPE_VALUES }) targetType!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) status!: string;
  @ApiProperty() submittedBy!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) submittedByName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
}

export class ApprovalTaskPageDto {
  @ApiProperty({ type: [ApprovalTaskListItemDto] }) data!: ApprovalTaskListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class ApprovalLogEntryDto {
  @ApiProperty({ enum: APPROVAL_ACTION_VALUES }) action!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/** Tóm tắt gian hàng đính kèm phiếu duyệt (khi target là tenant). */
export class ApprovalTenantSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() tenantType!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;

  /**
   * TUYẾN của gian hàng — `commission` (Basic Owner) hay `package` (gian hàng thuê bao).
   *
   * Reviewer cần biết vì hai tuyến có mức soi khác nhau: gian hàng thuê bao đã qua một vòng
   * thương mại, còn chủ xe tuyến hoa hồng vào miễn phí và đây là lần kiểm tra đầu tiên. Đọc từ
   * `billingMode` của gói hiện hành, KHÔNG suy từ `tenantType` (ADR 0014 điều 2: nhãn hiển thị,
   * không phải nguồn năng lực) và cũng không suy từ `planCode` (mọi tenant mới đều có gói).
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Xem BillingMode trong @xeprime/types',
  })
  billingMode!: string | null;

  /** Số xe đang bán trên chợ — reviewer thấy ngay đây là hồ sơ đầu tiên hay gian hàng đã chạy. */
  @ApiProperty() publicVehicleCount!: number;
}

export class ApprovalTaskDetailDto extends ApprovalTaskListItemDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Snapshot hồ sơ lúc gửi duyệt',
  })
  snapshot!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: ApprovalTenantSummaryDto, nullable: true })
  tenant!: ApprovalTenantSummaryDto | null;

  @ApiProperty({ type: [ApprovalLogEntryDto] }) logs!: ApprovalLogEntryDto[];
}

/** Lý do khi từ chối / yêu cầu bổ sung (bắt buộc); ghi chú khi duyệt (tuỳ chọn). */
export class ReviewActionDto {
  @ApiPropertyOptional({ description: 'Lý do / ghi chú gửi cho chủ shop' })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  reason?: string;
}
