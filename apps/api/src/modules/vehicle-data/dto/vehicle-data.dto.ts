import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  BODY_TYPE_VALUES,
  CATALOG_KEY_PATTERN,
  CATALOG_REVIEW_STATUS_VALUES,
  CATALOG_SEAT_COUNT_MAX,
  FUEL_TYPE_VALUES,
  RENT_REFERENCE_BASIS_VALUES,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_DATA_FILE_FIELDS,
  VEHICLE_DATA_GAP_FILTER_VALUES,
  VEHICLE_DATA_GAP_VALUES,
  VEHICLE_DATA_IMPORT_STATUS_VALUES,
  VEHICLE_DATA_ISSUE_LEVEL_VALUES,
  VEHICLE_DATA_ISSUE_VALUES,
  VEHICLE_DATA_LIMITS as LIMITS,
  VEHICLE_DATA_ORIGIN_VALUES,
  VEHICLE_DATA_RENT_FIELDS,
  VEHICLE_DATA_ROW_ACTION_VALUES,
  VEHICLE_DATA_STATUS_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Chuỗi rỗng ⇒ null: form gửi "" cho ô đã xoá. */
const blankToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const VND_PATTERN = /^\d{1,12}$/;
const DECIMAL_PATTERN = /^\d{1,4}(\.\d{1,2})?$/;

export const VEHICLE_DATA_DEFAULT_LIMIT = 20;
export const VEHICLE_DATA_MAX_LIMIT = 100;

export const VEHICLE_DATA_SORT = {
  UPDATED_DESC: 'updated_desc',
  NAME_ASC: 'name_asc',
  USAGE_DESC: 'usage_desc',
} as const;
export const VEHICLE_DATA_SORT_VALUES = Object.values(VEHICLE_DATA_SORT);

// ── Thông số + giá (dùng chung cho đọc và ghi) ─────────────────────────────────────────────────

/** Thông số + tiện ích của một xe chuẩn — đúng tên cột của `vehicles`. */
export class VehicleDataSpecDto {
  @ApiProperty({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiProperty({ type: String, nullable: true, enum: BODY_TYPE_VALUES }) bodyType!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: FUEL_TYPE_VALUES }) fuelType!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: TRANSMISSION_TYPE_EXT_VALUES })
  transmission!: string | null;
  @ApiProperty({ type: Number, nullable: true }) engineDisplacementCc!: number | null;
  @ApiProperty({ type: Number, nullable: true }) horsepowerHp!: number | null;
  @ApiProperty({ type: Number, nullable: true }) lengthMm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) widthMm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) heightMm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) curbWeightKg!: number | null;
  @ApiProperty({ type: String, nullable: true, example: '5.7' })
  fuelConsumptionCombined!: string | null;
  @ApiProperty({ type: Number, nullable: true }) electricRangeKm!: number | null;
  @ApiProperty({ type: String, nullable: true, example: '37.23' })
  batteryCapacityKwh!: string | null;
  @ApiProperty({ type: [String], description: 'Mã tiện ích (VEHICLE_FEATURE_KEYS)' })
  featureKeys!: string[];
}

/** Giá bán + giá thuê tham khảo (VND string, ADR 0007). */
export class VehicleDataPricesDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '471000000',
    description: 'Giá bán xe mới',
  })
  listPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) hourlyPrice!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '650000' }) weekdayPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) weekendPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) monthlyPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) withDriverDailyPrice!: string | null;
}

// ── Đọc: xe chuẩn như form chủ xe thấy ─────────────────────────────────────────────────────────

/** Một xe chuẩn ở ô "Phiên bản" của form chủ xe (GET /catalog/variants). */
export class VehicleDataOptionDto extends VehicleDataSpecDto {
  @ApiProperty() id!: string;
  @ApiProperty() modelId!: string;
  @ApiProperty({ example: '1.5G CVT', description: "'' = không phân biệt phiên bản" })
  label!: string;
  @ApiProperty({ type: Number, nullable: true }) yearFrom!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'null = còn bán' })
  yearTo!: number | null;
  @ApiProperty({
    enum: CATALOG_REVIEW_STATUS_VALUES,
    description: 'pending chỉ trả về qua includeId (xe đang gắn)',
  })
  reviewStatus!: string;
}

export class VehicleDataOptionQueryDto {
  @ApiProperty({ description: 'Dòng xe' })
  @IsString()
  @Length(26, 26)
  modelId!: string;

  @ApiPropertyOptional({
    description: 'Năm sản xuất của xe - chỉ trả xe chuẩn có đời chứa năm đó (đời trống = mọi năm)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(LIMITS.yearMin)
  @Max(LIMITS.yearMax)
  year?: number;

  @ApiPropertyOptional({
    description:
      'Xe chuẩn đang gắn với xe đang sửa - LUÔN có trong kết quả (kể cả chờ duyệt / đã ẩn)',
  })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  includeId?: string;
}

// ── Đọc: màn quản trị ──────────────────────────────────────────────────────────────────────────

export class VehicleDataMarketStatDto {
  @ApiProperty({ enum: VEHICLE_DATA_RENT_FIELDS }) field!: string;
  @ApiProperty({ description: 'Số xe đang lên chợ có giá ở ô này' }) sampleSize!: number;
  @ApiProperty({ type: String, nullable: true, description: 'P25' }) low!: string | null;
  @ApiProperty({ type: String, nullable: true }) median!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'P75' }) high!: string | null;
}

export class VehicleDataListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty() brandKey!: string;
  @ApiProperty() brandLabel!: string;
  @ApiProperty() modelId!: string;
  @ApiProperty() modelLabel!: string;
  @ApiProperty({ description: 'Dòng xe do chủ xe gõ mới, duyệt cùng xe chuẩn này' })
  modelPending!: boolean;
  @ApiProperty({ description: "'' = không phân biệt phiên bản" }) variantLabel!: string;
  @ApiProperty({ type: Number, nullable: true }) yearFrom!: number | null;
  @ApiProperty({ type: Number, nullable: true }) yearTo!: number | null;
  @ApiProperty({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiProperty({ type: String, nullable: true }) fuelType!: string | null;
  @ApiProperty({ type: String, nullable: true }) transmission!: string | null;
  @ApiProperty({ type: String, nullable: true }) bodyType!: string | null;
  @ApiProperty({ type: String, nullable: true }) listPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) weekdayPrice!: string | null;
  @ApiProperty({ enum: VEHICLE_DATA_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: VEHICLE_DATA_ORIGIN_VALUES }) origin!: string;
  @ApiProperty({ enum: VEHICLE_DATA_GAP_VALUES, isArray: true }) gaps!: string[];
  @ApiProperty({ description: 'Số xe của chủ xe đang gắn xe chuẩn này' }) usageCount!: number;
  @ApiProperty({
    type: VehicleDataMarketStatDto,
    nullable: true,
    description: 'Giá ngày thường thực tế của các xe đang gắn và đang lên chợ (đủ mẫu mới có)',
  })
  marketWeekday!: VehicleDataMarketStatDto | null;
  @ApiProperty({ type: String, nullable: true }) proposedByTenantName!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class VehicleDataSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() hidden!: number;
  @ApiProperty() pending!: number;
  @ApiProperty({ description: 'Đang gợi ý nhưng còn thiếu thông số / giá bán / giá thuê' })
  incomplete!: number;
}

export class VehicleDataPageDto {
  @ApiProperty({ type: [VehicleDataListItemDto] }) data!: VehicleDataListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
  @ApiProperty({ type: VehicleDataSummaryDto }) summary!: VehicleDataSummaryDto;
}

export class VehicleDataListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: VEHICLE_DATA_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(VEHICLE_DATA_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Tìm theo hãng / dòng xe / phiên bản (không dấu)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(CATALOG_KEY_PATTERN)
  brandKey?: string;

  @ApiPropertyOptional({ description: 'Chỉ xe chuẩn của một dòng xe' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  modelId?: string;

  @ApiPropertyOptional({ enum: VEHICLE_DATA_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_DATA_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: VEHICLE_DATA_ORIGIN_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_DATA_ORIGIN_VALUES)
  origin?: string;

  @ApiPropertyOptional({
    enum: VEHICLE_DATA_GAP_FILTER_VALUES,
    description: 'Chỉ xe chuẩn thiếu nhóm này; any = thiếu ít nhất một nhóm',
  })
  @IsOptional()
  @IsIn(VEHICLE_DATA_GAP_FILTER_VALUES)
  gap?: string;

  @ApiPropertyOptional({ enum: VEHICLE_DATA_SORT_VALUES, default: VEHICLE_DATA_SORT.UPDATED_DESC })
  @IsOptional()
  @IsIn(VEHICLE_DATA_SORT_VALUES)
  sort?: string;

  @ApiPropertyOptional({ description: 'Bỏ một xe chuẩn khỏi kết quả (hộp chọn xe để gộp)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  excludeId?: string;
}

export class VehicleDataVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiProperty({ type: String, nullable: true }) weekdayPrice!: string | null;
  @ApiProperty({ enum: VEHICLE_PUBLIC_STATUS_VALUES }) publicStatus!: string;
}

export class VehicleDataValueYearDto {
  @ApiProperty() year!: number;
  @ApiProperty() amount!: string;
  @ApiProperty() residualPercent!: number;
}

export class VehicleDataSimilarDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: Number, nullable: true }) yearFrom!: number | null;
  @ApiProperty({ type: Number, nullable: true }) yearTo!: number | null;
  @ApiProperty({ enum: VEHICLE_DATA_STATUS_VALUES }) status!: string;
}

export class VehicleDataDetailDto extends VehicleDataSpecDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty() brandKey!: string;
  @ApiProperty() brandLabel!: string;
  @ApiProperty() modelId!: string;
  @ApiProperty() modelLabel!: string;
  @ApiProperty() modelPending!: boolean;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: Number, nullable: true }) yearFrom!: number | null;
  @ApiProperty({ type: Number, nullable: true }) yearTo!: number | null;
  @ApiProperty({ type: String, nullable: true }) listPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) hourlyPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) weekdayPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) weekendPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) monthlyPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) withDriverDailyPrice!: string | null;
  @ApiProperty({ enum: VEHICLE_DATA_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: VEHICLE_DATA_ORIGIN_VALUES }) origin!: string;
  @ApiProperty({ enum: VEHICLE_DATA_GAP_VALUES, isArray: true }) gaps!: string[];
  @ApiProperty({ type: String, nullable: true }) proposedByTenantName!: string | null;
  @ApiProperty({
    type: VehicleDataVehicleDto,
    nullable: true,
    description: 'Xe của chủ xe mà dữ liệu được tự ghi nhận từ đó',
  })
  sourceVehicle!: VehicleDataVehicleDto | null;
  @ApiProperty({ type: String, nullable: true }) reviewNote!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) reviewedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) updatedByName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() usageCount!: number;
  @ApiProperty({ type: [VehicleDataVehicleDto], description: 'Tối đa 10 xe mới nhất đang gắn' })
  vehicles!: VehicleDataVehicleDto[];
  @ApiProperty({ type: [VehicleDataMarketStatDto] }) market!: VehicleDataMarketStatDto[];
  @ApiProperty({
    type: [VehicleDataValueYearDto],
    description: 'Giá trị xe tham khảo theo năm sản xuất (ô tô có giá bán)',
  })
  valueByYear!: VehicleDataValueYearDto[];
  @ApiProperty({
    type: [VehicleDataSimilarDto],
    description: 'Xe chuẩn khác cùng dòng có thể trùng (cùng phiên bản hoặc đời chồng nhau)',
  })
  similar!: VehicleDataSimilarDto[];
}

// ── Ghi ────────────────────────────────────────────────────────────────────────────────────────

export class SaveVehicleDataDto {
  @ApiPropertyOptional({
    description: 'Dòng xe đã có. Gửi `modelId` HOẶC (`brandKey` + `newModelLabel`)',
  })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  modelId?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES, description: 'Bắt buộc khi tạo dòng xe mới' })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ description: 'Hãng của dòng xe mới' })
  @IsOptional()
  @Matches(CATALOG_KEY_PATTERN)
  brandKey?: string;

  @ApiPropertyOptional({ description: 'Tên dòng xe mới (chưa có trong danh mục)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/\S/)
  @MaxLength(LIMITS.labelMax)
  newModelLabel?: string;

  @ApiPropertyOptional({ description: "Phiên bản; '' = không phân biệt phiên bản" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(LIMITS.labelMax)
  variantLabel?: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(LIMITS.yearMin)
  @Max(LIMITS.yearMax)
  yearFrom?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = còn bán' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(LIMITS.yearMin)
  @Max(LIMITS.yearMax)
  yearTo?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CATALOG_SEAT_COUNT_MAX)
  seatCount?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: BODY_TYPE_VALUES })
  @IsOptional()
  @IsIn(BODY_TYPE_VALUES)
  bodyType?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: FUEL_TYPE_VALUES })
  @IsOptional()
  @IsIn(FUEL_TYPE_VALUES)
  fuelType?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: TRANSMISSION_TYPE_EXT_VALUES })
  @IsOptional()
  @IsIn(TRANSMISSION_TYPE_EXT_VALUES)
  transmission?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30000)
  engineDisplacementCc?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  horsepowerHp?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30000)
  lengthMm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  widthMm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  heightMm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  curbWeightKg?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '5.7' })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(DECIMAL_PATTERN, { message: 'fuelConsumptionCombined tối đa 2 chữ số thập phân' })
  fuelConsumptionCombined?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  electricRangeKm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '37.23' })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(DECIMAL_PATTERN, { message: 'batteryCapacityKwh tối đa 2 chữ số thập phân' })
  batteryCapacityKwh?: string | null;

  @ApiPropertyOptional({ type: [String], enum: VEHICLE_FEATURE_KEYS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIMITS.featuresMax)
  @IsIn(VEHICLE_FEATURE_KEYS, { each: true })
  featureKeys?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giá bán xe mới (VND)' })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(VND_PATTERN, { message: 'listPrice phải là số nguyên VND' })
  listPrice?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(VND_PATTERN, { message: 'hourlyPrice phải là số nguyên VND' })
  hourlyPrice?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(VND_PATTERN, { message: 'weekdayPrice phải là số nguyên VND' })
  weekdayPrice?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(VND_PATTERN, { message: 'weekendPrice phải là số nguyên VND' })
  weekendPrice?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(VND_PATTERN, { message: 'monthlyPrice phải là số nguyên VND' })
  monthlyPrice?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @Matches(VND_PATTERN, { message: 'withDriverDailyPrice phải là số nguyên VND' })
  withDriverDailyPrice?: string | null;

  @ApiPropertyOptional({ description: 'false = Ẩn (không gợi ý). Bỏ qua với xe chuẩn chờ duyệt' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateVehicleDataDto extends PartialType(SaveVehicleDataDto) {}

export class ApproveVehicleDataDto {
  @ApiPropertyOptional({ maxLength: LIMITS.noteMax })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(LIMITS.noteMax)
  note?: string;
}

export class MergeVehicleDataDto {
  @ApiProperty({ description: 'Xe chuẩn ĐÃ DUYỆT sẽ nhận các xe đang gắn' })
  @IsString()
  @Length(26, 26)
  targetId!: string;

  @ApiPropertyOptional({ maxLength: LIMITS.noteMax })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(LIMITS.noteMax)
  note?: string;
}

export class RejectVehicleDataDto {
  @ApiProperty({ maxLength: LIMITS.noteMax })
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: 'reason không được để trống' })
  @MaxLength(LIMITS.noteMax)
  reason!: string;
}

export class VehicleDataReviewResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CATALOG_REVIEW_STATUS_VALUES }) reviewStatus!: string;
  @ApiProperty({ description: 'Số xe của chủ xe đổi liên kết' }) vehiclesAffected!: number;
}

/** Dòng xe chủ xe gõ mới ngay trong ô "Dòng xe" của form (ADR 0090). */
export class CreateOwnerModelDto {
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: string;

  @ApiProperty()
  @Matches(CATALOG_KEY_PATTERN)
  brandKey!: string;

  @ApiProperty({ maxLength: LIMITS.labelMax })
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(LIMITS.labelMax)
  label!: string;
}

// ── Nhập file ──────────────────────────────────────────────────────────────────────────────────

export class VehicleDataImportSummaryDto {
  @ApiProperty() rowsTotal!: number;
  @ApiProperty() rowsCreate!: number;
  @ApiProperty() rowsUpdate!: number;
  @ApiProperty() rowsUnchanged!: number;
  @ApiProperty() rowsError!: number;
  @ApiProperty({ description: 'Số dòng có ít nhất một cảnh báo' }) rowsWarning!: number;
  @ApiProperty() newBrands!: number;
  @ApiProperty() newModels!: number;
  @ApiProperty({ type: [String], description: 'Cột tiêu đề không nhận ra (bị bỏ qua)' })
  unknownColumns!: string[];
}

export class VehicleDataImportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VEHICLE_DATA_IMPORT_STATUS_VALUES }) status!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty({ type: VehicleDataImportSummaryDto }) summary!: VehicleDataImportSummaryDto;
  @ApiProperty({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) appliedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) appliedByName!: string | null;
  @ApiProperty({ format: 'date-time', description: 'Bản xem trước hết hạn lúc này' })
  expiresAt!: string;
}

export class VehicleDataImportPageDto {
  @ApiProperty({ type: [VehicleDataImportDto] }) data!: VehicleDataImportDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class VehicleDataImportIssueDto {
  @ApiProperty({ enum: VEHICLE_DATA_ISSUE_LEVEL_VALUES }) level!: string;
  @ApiProperty({ enum: VEHICLE_DATA_ISSUE_VALUES }) code!: string;
  @ApiProperty({ type: String, nullable: true, enum: VEHICLE_DATA_FILE_FIELDS })
  field!: string | null;
  @ApiProperty({ type: String, nullable: true }) value!: string | null;
}

export class VehicleDataImportChangeDto {
  @ApiProperty({ enum: VEHICLE_DATA_FILE_FIELDS }) field!: string;
  @ApiProperty({ type: String, nullable: true }) before!: string | null;
  @ApiProperty({ type: String, nullable: true }) after!: string | null;
}

export class VehicleDataImportRowDto {
  @ApiProperty({ description: 'Số dòng trong file (1 = dòng tiêu đề)' }) rowNumber!: number;
  @ApiProperty({ enum: VEHICLE_DATA_ROW_ACTION_VALUES }) action!: string;
  @ApiProperty({ description: 'Hãng · Dòng · Phiên bản · Đời như trong file' }) title!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Xe chuẩn được cập nhật / đã tạo' })
  recordId!: string | null;
  @ApiProperty({ type: [VehicleDataImportIssueDto] }) issues!: VehicleDataImportIssueDto[];
  @ApiProperty({ type: [VehicleDataImportChangeDto] }) changes!: VehicleDataImportChangeDto[];
}

export class VehicleDataImportRowPageDto {
  @ApiProperty({ type: [VehicleDataImportRowDto] }) data!: VehicleDataImportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class VehicleDataImportListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: VEHICLE_DATA_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(VEHICLE_DATA_MAX_LIMIT)
  limit?: number;
}

export class VehicleDataImportRowsQueryDto extends VehicleDataImportListQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_DATA_ROW_ACTION_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_DATA_ROW_ACTION_VALUES)
  action?: string;

  @ApiPropertyOptional({ description: 'true = chỉ dòng có cảnh báo hoặc lỗi' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  withIssues?: boolean;
}

/** Body multipart của lượt tải file — chỉ để Swagger mô tả; file đọc qua FileInterceptor. */
export class VehicleDataImportUploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: '.xlsx hoặc .csv, ≤ 5 MB' })
  file!: unknown;
}

// ── Gợi ý cho chủ xe ───────────────────────────────────────────────────────────────────────────

export class VehicleDataSuggestionQueryDto {
  @ApiProperty({ description: 'Dòng xe' })
  @IsString()
  @Length(26, 26)
  modelId!: string;

  @ApiPropertyOptional({ description: 'Xe chuẩn chủ xe đã chọn ở ô "Phiên bản"' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  variantId?: string;

  @ApiPropertyOptional({ description: 'Năm sản xuất của xe' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(LIMITS.yearMin)
  @Max(LIMITS.yearMax)
  year?: number;

  @ApiPropertyOptional({ description: 'Xe đang sửa - không tính chính nó vào giá thực tế' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  vehicleId?: string;
}

export class VehicleDataMarketDto {
  @ApiProperty() sampleSize!: number;
  @ApiProperty() low!: string;
  @ApiProperty() median!: string;
  @ApiProperty() high!: string;
}

export class VehicleDataRentSuggestionDto {
  @ApiProperty({ enum: VEHICLE_DATA_RENT_FIELDS, description: 'Ô giá của form xe' })
  field!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Giá thuê tham khảo của XePrime' })
  reference!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: RENT_REFERENCE_BASIS_VALUES })
  referenceBasis!: string | null;
  @ApiProperty({
    type: VehicleDataMarketDto,
    nullable: true,
    description: 'Giá các xe cùng dòng, cùng đời đang lên chợ XePrime (đủ mẫu mới có)',
  })
  market!: VehicleDataMarketDto | null;
}

export class VehicleDataValueDto {
  @ApiProperty({ description: 'Bội 1.000.000đ' }) amount!: string;
  @ApiProperty() age!: number;
  @ApiProperty() residualPercent!: number;
}

export class VehicleDataSuggestionDto {
  @ApiProperty() modelId!: string;
  @ApiProperty({
    type: VehicleDataOptionDto,
    nullable: true,
    description:
      'Xe chuẩn dùng để gợi ý thông số: đúng xe đã chọn, hoặc xe chuẩn DUY NHẤT của dòng có đời chứa năm sản xuất',
  })
  record!: VehicleDataOptionDto | null;
  @ApiProperty({
    type: VehicleDataValueDto,
    nullable: true,
    description: 'Giá trị xe tham khảo (chỉ ô tô có giá bán)',
  })
  value!: VehicleDataValueDto | null;
  @ApiProperty({ type: [VehicleDataRentSuggestionDto] }) rent!: VehicleDataRentSuggestionDto[];
}
