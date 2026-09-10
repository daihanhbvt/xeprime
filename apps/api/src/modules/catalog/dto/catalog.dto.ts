import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CATALOG_ITEM_TYPES,
  CATALOG_KEY_PATTERN,
  CATALOG_MARKET_STATUS_VALUES,
  FUEL_TYPE_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Một mục danh mục như FE nhìn thấy. `key` là thứ lưu xuống xe, `label` chỉ để hiển thị. */
export class CatalogItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: CATALOG_ITEM_TYPES })
  type!: string;

  @ApiProperty({ example: 'suv' })
  key!: string;

  @ApiProperty({ example: 'SUV' })
  label!: string;

  @ApiProperty({ type: String, nullable: true, example: '7 chỗ · gầm cao' })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '/body-types/suv.png' })
  iconUrl!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({
    type: [String],
    enum: VEHICLE_TYPE_VALUES,
    description: 'Loại xe mục này áp dụng. MẢNG RỖNG = mọi loại.',
  })
  vehicleTypes!: string[];
}

/** Mục danh mục kèm số xe đang dùng — chỉ màn quản trị cần, bộ lọc công khai không. */
export class CatalogItemAdminDto extends CatalogItemDto {
  @ApiProperty({ description: 'Số xe đang trỏ vào key này (mọi gian hàng)' })
  usageCount!: number;
}

export class CatalogQueryDto {
  @ApiPropertyOptional({
    enum: CATALOG_ITEM_TYPES,
    description: 'Bỏ trống = trả cả bốn chiều trong một lượt',
  })
  @IsOptional()
  @IsIn(CATALOG_ITEM_TYPES)
  type?: string;

  @ApiPropertyOptional({
    enum: VEHICLE_TYPE_VALUES,
    description:
      'Chỉ trả mục dùng được cho loại xe này (hãng, tiện nghi, kiểu dáng). Bỏ trống = không lọc.',
  })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;
}

export class CatalogAdminQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ description: 'true = kèm cả mục đã tắt', default: true })
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateCatalogItemDto {
  @ApiProperty({ enum: CATALOG_ITEM_TYPES })
  @IsIn(CATALOG_ITEM_TYPES)
  type!: string;

  @ApiProperty({
    example: 'coupe',
    description: 'Slug lưu xuống xe và đi vào URL bộ lọc — không đổi được sau khi tạo',
  })
  @IsString()
  @Matches(CATALOG_KEY_PATTERN, {
    message: 'key chỉ gồm chữ thường/số/gạch, bắt đầu bằng chữ hoặc số, tối đa 80 ký tự',
  })
  key!: string;

  @ApiProperty({ example: 'Coupe' })
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({ example: '2 chỗ · thể thao' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ example: '/body-types/coupe.png' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  iconUrl?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [String],
    enum: VEHICLE_TYPE_VALUES,
    description: 'Bỏ trống = áp dụng mọi loại xe',
  })
  @IsOptional()
  @IsArray()
  @IsIn(VEHICLE_TYPE_VALUES, { each: true })
  vehicleTypes?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Sửa mục — KHÔNG đổi `type`/`key`: hai trường đó là định danh, xe đã lưu đang trỏ vào. */
export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  iconUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ type: [String], enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsArray()
  @IsIn(VEHICLE_TYPE_VALUES, { each: true })
  vehicleTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Kéo-thả sắp xếp: gửi trọn thứ tự mới của MỘT chiều, tránh 8 lượt PATCH lệch nhau. */
export class ReorderCatalogDto {
  @ApiProperty({ enum: CATALOG_ITEM_TYPES })
  @IsIn(CATALOG_ITEM_TYPES)
  type!: string;

  @ApiProperty({ type: [String], description: 'Danh sách id theo đúng thứ tự hiển thị mong muốn' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * MẪU XE — bảng `vehicle_catalog_models`, không phải `catalog_items`.
 *
 * `brandKey` + `vehicleType` là cặp định danh nhóm: form chỉ hỏi mẫu SAU KHI đã biết hai giá trị
 * đó, nên client không bao giờ phải tự lọc một danh sách phẳng vài trăm dòng.
 */
export class CatalogModelDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'honda-sh-mode-125' })
  key!: string;

  @ApiProperty({ example: 'SH Mode 125' })
  label!: string;

  @ApiProperty({ example: 'honda' })
  brandKey!: string;

  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  vehicleType!: string;

  @ApiProperty({
    enum: CATALOG_MARKET_STATUS_VALUES,
    description: 'current = đang phân phối · legacy = mẫu đời trước, vẫn chọn được',
  })
  marketStatus!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: MOTORBIKE_CATEGORY_VALUES,
    description: 'Chỉ mẫu xe máy',
  })
  motorbikeCategory!: string | null;

  @ApiProperty({ type: [String], description: 'Rỗng = chưa xác minh, đừng dùng để lọc' })
  fuelTypes!: string[];

  @ApiProperty({ type: [String], description: 'Rỗng = chưa xác minh' })
  transmissions!: string[];

  @ApiProperty({ type: Number, nullable: true })
  engineDisplacementCc!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  seatCount!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  yearFrom!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  yearTo!: number | null;

  @ApiProperty()
  active!: boolean;
}

/** Bản quản trị: kèm nguồn tra cứu để người rà danh mục biết dữ liệu đến từ đâu. */
export class CatalogModelAdminDto extends CatalogModelDto {
  @ApiProperty({ type: String, nullable: true, description: 'Trang sản phẩm chính hãng đã đối chiếu' })
  sourceUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  verifiedAt!: string | null;

  @ApiProperty({ description: 'Số xe đang gắn mẫu này' })
  usageCount!: number;
}

export class CatalogModelQueryDto {
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES, description: 'Bắt buộc — mẫu xe luôn thuộc một loại' })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: string;

  @ApiPropertyOptional({ description: 'Khoá hãng; bỏ trống = mọi hãng của loại xe đó' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brandKey?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên, bỏ dấu — "civic" khớp "CIVIC"' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Id mẫu đang gắn với xe đang sửa. Mẫu đó LUÔN nằm trong kết quả kể cả khi đã tắt — ' +
      'bằng không form sẽ hiện ô rỗng cho một chiếc xe vẫn đang có mẫu.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  includeId?: string;
}

export class CatalogModelAdminQueryDto extends CatalogModelQueryDto {
  @ApiPropertyOptional({ description: 'true = kèm mẫu đã tắt', default: true })
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateCatalogModelDto {
  @ApiProperty({ example: 'CIVIC' })
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(120)
  label!: string;

  @ApiProperty({ example: 'honda' })
  @IsString()
  @Matches(CATALOG_KEY_PATTERN, { message: 'brandKey phải là mã hãng trong danh mục' })
  brandKey!: string;

  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: string;

  @ApiPropertyOptional({ enum: CATALOG_MARKET_STATUS_VALUES, default: 'current' })
  @IsOptional()
  @IsIn(CATALOG_MARKET_STATUS_VALUES)
  marketStatus?: string;

  @ApiPropertyOptional({ enum: MOTORBIKE_CATEGORY_VALUES, nullable: true })
  @IsOptional()
  @IsIn(MOTORBIKE_CATEGORY_VALUES)
  motorbikeCategory?: string | null;

  @ApiPropertyOptional({ type: [String], enum: FUEL_TYPE_VALUES })
  @IsOptional()
  @IsArray()
  @IsIn(FUEL_TYPE_VALUES, { each: true })
  fuelTypes?: string[];

  @ApiPropertyOptional({ type: [String], enum: TRANSMISSION_TYPE_EXT_VALUES })
  @IsOptional()
  @IsArray()
  @IsIn(TRANSMISSION_TYPE_EXT_VALUES, { each: true })
  transmissions?: string[];

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  engineDisplacementCc?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  seatCount?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  yearFrom?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  yearTo?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Trang sản phẩm chính hãng — nguồn của dữ liệu này',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * Sửa mẫu xe. `brandKey`/`vehicleType` KHÔNG đổi được: đổi hãng của một mẫu là biến chiếc xe của
 * người khác thành xe hãng khác — tạo mẫu mới rồi tắt mẫu cũ.
 */
export class UpdateCatalogModelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ enum: CATALOG_MARKET_STATUS_VALUES })
  @IsOptional()
  @IsIn(CATALOG_MARKET_STATUS_VALUES)
  marketStatus?: string;

  @ApiPropertyOptional({ enum: MOTORBIKE_CATEGORY_VALUES, nullable: true })
  @IsOptional()
  @IsIn(MOTORBIKE_CATEGORY_VALUES)
  motorbikeCategory?: string | null;

  @ApiPropertyOptional({ type: [String], enum: FUEL_TYPE_VALUES })
  @IsOptional()
  @IsArray()
  @IsIn(FUEL_TYPE_VALUES, { each: true })
  fuelTypes?: string[];

  @ApiPropertyOptional({ type: [String], enum: TRANSMISSION_TYPE_EXT_VALUES })
  @IsOptional()
  @IsArray()
  @IsIn(TRANSMISSION_TYPE_EXT_VALUES, { each: true })
  transmissions?: string[];

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  engineDisplacementCc?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  seatCount?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  yearFrom?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  yearTo?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
