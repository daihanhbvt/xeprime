import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FINANCE_CATEGORY_TYPE_VALUES,
  PAYMENT_METHOD_VALUES,
  RECEIPT_STATUS_VALUES,
  RECEIPT_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Tiền nhập string thập phân ≤ 2 số lẻ (ADR 0007 — không dùng number). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export { DEFAULT_LIMIT as RECEIPT_DEFAULT_LIMIT, MAX_LIMIT as RECEIPT_MAX_LIMIT };

// --- Danh mục thu/chi ------------------------------------------------------

export class CategoryListQueryDto {
  @ApiPropertyOptional({ enum: FINANCE_CATEGORY_TYPE_VALUES })
  @IsOptional()
  @IsIn(FINANCE_CATEGORY_TYPE_VALUES)
  type?: string;
}

export class CreateCategoryDto {
  @ApiProperty({ enum: FINANCE_CATEGORY_TYPE_VALUES })
  @IsIn(FINANCE_CATEGORY_TYPE_VALUES)
  type!: string;

  @ApiProperty({ example: 'Phí vệ sinh xe' })
  @IsString()
  @Length(1, 255)
  name!: string;
}

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Phí vệ sinh xe' })
  @IsString()
  @Length(1, 255)
  name!: string;
}

export class FinanceCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FINANCE_CATEGORY_TYPE_VALUES }) type!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Danh mục hệ thống — không sửa/xoá được' }) isSystem!: boolean;
}

// --- Phiếu thu/chi ---------------------------------------------------------

export class ReceiptListQueryDto {
  @ApiPropertyOptional({ enum: RECEIPT_TYPE_VALUES })
  @IsOptional()
  @IsIn(RECEIPT_TYPE_VALUES)
  type?: string;

  @ApiPropertyOptional({ enum: RECEIPT_STATUS_VALUES })
  @IsOptional()
  @IsIn(RECEIPT_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo danh mục' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo đơn thuê' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (ISO) — theo created_at' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

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

export class CreateReceiptDto {
  @ApiProperty({ enum: RECEIPT_TYPE_VALUES, description: 'income = phiếu thu, expense = phiếu chi' })
  @IsIn(RECEIPT_TYPE_VALUES)
  type!: string;

  @ApiProperty({ description: 'Tiền, string thập phân — ADR 0007', example: '500000' })
  @Matches(MONEY_PATTERN, { message: 'amount phải là số tiền hợp lệ' })
  amount!: string;

  @ApiProperty({ enum: PAYMENT_METHOD_VALUES })
  @IsIn(PAYMENT_METHOD_VALUES)
  paymentMethod!: string;

  @ApiPropertyOptional({ description: 'Danh mục (ULID)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Đơn thuê liên quan (ULID)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Xe liên quan (ULID)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Mã tra soát/tham chiếu (CK…)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  referenceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'URL ảnh minh chứng (tối đa 10)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  attachments?: string[];
}

export class CancelReceiptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReceiptListItemDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) receiptNo!: string | null;
  @ApiProperty({ enum: RECEIPT_TYPE_VALUES }) type!: string;
  @ApiProperty({ enum: RECEIPT_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) amount!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) categoryId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) categoryName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class ReceiptDetailDto extends ReceiptListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) referenceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) approvedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelledAt!: string | null;
  @ApiProperty({ type: [String], description: 'URL ảnh minh chứng' }) attachments!: string[];
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

export class ReceiptPageDto {
  @ApiProperty({ type: [ReceiptListItemDto] }) data!: ReceiptListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
