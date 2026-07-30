import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  APPROVAL_STATUS_VALUES,
  BODY_TYPE_VALUES,
  FUEL_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

/** Cách sắp xếp danh sách xe của gian hàng. */
export const VEHICLE_SORT = [
  'newest',
  'name_asc',
  'code_asc',
  'price_asc',
  'price_desc',
] as const;
export type VehicleSort = (typeof VEHICLE_SORT)[number];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Đời xe hợp lệ: từ 1980 đến sang năm (xe đời mới ra trước lịch). */
const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 1;
/** Tiền nhập vào dạng chuỗi thập phân tối đa 2 số lẻ (ADR 0007 — không dùng number). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export { DEFAULT_LIMIT as VEHICLE_DEFAULT_LIMIT, MAX_LIMIT as VEHICLE_MAX_LIMIT };

/**
 * Query danh sách xe — luôn phân trang + filter + sort ở tầng DB (skill backend-endpoint).
 * `limit` có trần cứng: một gian hàng có thể có hàng trăm/nghìn xe, client không kéo cả bảng.
 */
export class VehicleListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên/mã/biển số/hãng/model' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ enum: VEHICLE_OPERATION_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_OPERATION_STATUS_VALUES)
  operationStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_PUBLIC_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_PUBLIC_STATUS_VALUES)
  publicStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_SORT, default: 'newest' })
  @IsOptional()
  @IsIn(VEHICLE_SORT)
  sort?: VehicleSort;

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

/** Một dòng trong bảng danh sách xe — vừa đủ cho bảng, không kéo mô tả dài. */
export class VehicleListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  // `type` tường minh cho field nullable: reflect-metadata trả `Object` cho union `X | null`,
  // thiếu nó thì openapi-typescript sinh ra `Record<string, never>` thay vì string/number.
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Kiểu dáng (BODY_TYPE)' })
  bodyType!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: '% giảm giá marketing (0–100)' })
  discountPercent!: number | null;
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
  @ApiProperty({ enum: VEHICLE_PUBLIC_STATUS_VALUES }) publicStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền dạng string — ADR 0007' })
  weekdayPrice!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  weekendPrice!: string | null;

  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/** Tóm tắt lần gửi duyệt công khai gần nhất — để shop thấy lý do bị từ chối/bổ sung. */
export class VehiclePublicReviewDto {
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!: string | null;
}

/** Chi tiết một xe — dùng cho trang xem/sửa. */
export class VehicleDetailDto extends VehicleListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiPropertyOptional({ enum: FUEL_TYPE_VALUES, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giá thuê giờ — string tiền (ADR 0007)' })
  hourlyPrice!: string | null;

  @ApiProperty({ description: 'Chủ xe hỗ trợ giao xe tận nơi' }) deliveryEnabled!: boolean;
  @ApiProperty({ description: 'Miễn thế chấp (không cần cọc tài sản)' }) noCollateral!: boolean;

  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;

  @ApiProperty({ type: [String], description: 'URL ảnh gallery theo thứ tự' })
  images!: string[];

  @ApiProperty({ type: [String], description: 'Key tiện ích (VEHICLE_FEATURE_LABEL)' })
  features!: string[];

  @ApiPropertyOptional({ type: VehiclePublicReviewDto, nullable: true })
  latestPublicReview!: VehiclePublicReviewDto | null;
}

/** Bọc phân trang cho danh sách xe (ADR 0007 — shape phải khai báo để FE sinh đúng type). */
export class VehiclePageDto {
  @ApiProperty({ type: [VehicleListItemDto] }) data!: VehicleListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Tạo xe. KHÔNG nhận `publicStatus`/`tenantId`: xe mới luôn là `draft` (schema default) và
 * tenant lấy từ scope. Đưa xe ra công khai đi qua luồng duyệt riêng (ADR 0008), không phải ở đây.
 */
export class CreateVehicleDto {
  @ApiProperty({ description: 'Mã xe nội bộ, duy nhất trong gian hàng', example: 'XE-001' })
  @IsString()
  @Length(1, 80)
  code!: string;

  @ApiProperty({ example: 'Toyota Vios 2022' })
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES, default: SERVICE_TYPE.SELF_DRIVE })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ example: '51K-123.45' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ minimum: MIN_YEAR, maximum: MAX_YEAR })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  manufactureYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 64 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  seatCount?: number;

  @ApiPropertyOptional({ enum: FUEL_TYPE_VALUES })
  @IsOptional()
  @IsIn(FUEL_TYPE_VALUES)
  fuelType?: string;

  // Các trường có thể GỠ giá trị (gửi null) — @IsOptional bỏ qua validate khi null,
  // service ghi null xuống DB để xoá (vd đổi ô tô → xe máy thì bỏ kiểu dáng).
  @ApiPropertyOptional({
    enum: BODY_TYPE_VALUES,
    nullable: true,
    description: 'Kiểu dáng thân xe — chỉ với ô tô. Gửi null để xoá.',
  })
  @IsOptional()
  @IsIn(BODY_TYPE_VALUES)
  bodyType?: string | null;

  @ApiPropertyOptional({ enum: VEHICLE_OPERATION_STATUS_VALUES, default: VEHICLE_OPERATION_STATUS.AVAILABLE })
  @IsOptional()
  @IsIn(VEHICLE_OPERATION_STATUS_VALUES)
  operationStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ description: 'URL ảnh đại diện xe' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mainImageUrl?: string;

  @ApiPropertyOptional({ description: 'Giá ngày thường, string thập phân — ADR 0007', example: '600000' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'weekdayPrice phải là số tiền hợp lệ' })
  weekdayPrice?: string;

  @ApiPropertyOptional({ description: 'Giá cuối tuần', example: '750000' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'weekendPrice phải là số tiền hợp lệ' })
  weekendPrice?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê theo giờ, string thập phân — ADR 0007. Gửi null = không cho thuê giờ.',
    example: '120000',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'hourlyPrice phải là số tiền hợp lệ' })
  hourlyPrice?: string | null;

  @ApiPropertyOptional({ description: 'Chủ xe hỗ trợ giao xe tận nơi' })
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Miễn thế chấp (không cần cọc tài sản)' })
  @IsOptional()
  @IsBoolean()
  noCollateral?: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100,
    description: '% giảm giá marketing. Gửi null = ngừng giảm giá.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'URL ảnh gallery theo thứ tự (thay toàn bộ khi gửi)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  images?: string[];

  @ApiPropertyOptional({
    isArray: true,
    enum: VEHICLE_FEATURE_KEYS,
    description: 'Tiện ích xe (thay toàn bộ khi gửi)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(VEHICLE_FEATURE_KEYS.length)
  @IsIn(VEHICLE_FEATURE_KEYS, { each: true })
  features?: string[];
}

/**
 * Sửa xe — mọi trường optional. Vẫn KHÔNG có `publicStatus`: đổi trạng thái public đi qua
 * luồng duyệt (ADR 0008). `operationStatus` (sẵn sàng/bảo dưỡng/ngừng) là toggle vận hành
 * của gian hàng nên cho sửa ở đây.
 */
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
