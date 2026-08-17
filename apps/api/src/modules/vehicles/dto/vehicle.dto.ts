import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  APPROVAL_STATUS_VALUES,
  BOOKING_STATUS_VALUES,
  CATALOG_KEY_PATTERN,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { VehicleAlertDto } from './vehicle-alert.dto';

/** Cách sắp xếp danh sách xe của gian hàng. */
export const VEHICLE_SORT = ['newest', 'name_asc', 'code_asc', 'price_asc', 'price_desc'] as const;
export type VehicleSort = (typeof VEHICLE_SORT)[number];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Đời xe hợp lệ: từ 1980 đến sang năm (xe đời mới ra trước lịch). */
const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 1;
/** Tiền nhập vào dạng chuỗi thập phân tối đa 2 số lẻ (ADR 0007 — không dùng number). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/**
 * Trần số tiện ích một xe. Danh mục tiện ích nằm ở DB nên không còn đếm được lúc compile;
 * đây là chặn payload phình, còn "key có thật không" do `CatalogService` kiểm.
 */
const MAX_FEATURES = 64;

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

  /** Lọc "xe PHỤC VỤ ĐƯỢC dịch vụ X" — chạy `has` trên mảng `service_types`. */
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

  /**
   * Lọc theo chi nhánh — nguồn của bộ chọn "Tất cả chi nhánh" ở thanh trên.
   *
   * KHÔNG phải cơ chế phân quyền: `tenantId` vẫn quyết định phạm vi, `branchId` chỉ thu hẹp
   * thêm. Chi nhánh của gian hàng khác lọt vào đây cũng chỉ ra danh sách rỗng.
   */
  @ApiPropertyOptional({ description: 'Id chi nhánh — chỉ thu hẹp trong gian hàng hiện tại' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  branchId?: string;

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
/** Chi nhánh của xe, dạng tóm tắt — đủ để hiển thị "xe nằm ở đâu" mà không phải gọi thêm API. */
export class VehicleBranchSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
}

export class VehicleListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  /**
   * `null` chỉ với dữ liệu cũ chưa qua migration chi nhánh — xe tạo mới luôn có. FE hiển thị
   * "Chưa gán chi nhánh" thay vì đoán.
   */
  @ApiPropertyOptional({ type: VehicleBranchSummaryDto, nullable: true })
  branch!: VehicleBranchSummaryDto | null;
  // `type` tường minh cho field nullable: reflect-metadata trả `Object` cho union `X | null`,
  // thiếu nó thì openapi-typescript sinh ra `Record<string, never>` thay vì string/number.
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true }) serviceTypes!: string[];
  @ApiPropertyOptional({ enum: VEHICLE_SOURCE_TYPE_VALUES }) sourceType?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Key kiểu dáng — tra nhãn ở danh mục `body_type` (GET /catalog)',
  })
  bodyType!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% giảm giá marketing (0–100)',
  })
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
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Key nhiên liệu — tra nhãn ở danh mục `fuel_type` (GET /catalog)',
  })
  fuelType!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) lengthMm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) widthMm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) heightMm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) curbWeightKg!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) engineDisplacementCc!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) horsepowerHp!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: TRANSMISSION_TYPE_VALUES })
  transmission!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'L/100km dạng decimal string' })
  fuelConsumptionCity!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'L/100km dạng decimal string' })
  fuelConsumptionHighway!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'L/100km dạng decimal string' })
  fuelConsumptionCombined!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê giờ — string tiền (ADR 0007)',
  })
  hourlyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá tháng tham chiếu thuê dài hạn — string tiền (ADR 0007)',
  })
  monthlyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày đã gồm tài xế — string tiền (ADR 0007)',
  })
  withDriverDailyPrice!: string | null;

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
  @ApiPropertyOptional({
    description: 'Mã xe nội bộ. Bỏ trống để hệ thống tự sinh.',
    example: 'XE-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiProperty({ example: 'Toyota Vios 2022' })
  @IsString()
  @Length(1, 255)
  name!: string;

  /**
   * BẮT BUỘC: chi nhánh giữ xe. Đây là nguồn VỊ TRÍ CÔNG KHAI của xe trên marketplace, nên
   * không có mặc định ngầm ở backend — FE chọn sẵn chi nhánh mặc định để thao tác vẫn một bước,
   * nhưng giá trị phải đi qua request để "xe này ở đâu" luôn là một quyết định có chủ ý.
   *
   * `provinceName`/`provinceCode` KHÔNG nhận từ client: vị trí suy từ chi nhánh.
   */
  @ApiProperty({ description: 'Id chi nhánh đang hoạt động của gian hàng (GET /branches)' })
  @IsString()
  @Length(26, 26)
  branchId!: string;

  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: string;

  /**
   * MẢNG dịch vụ xe phục vụ được (17/08) — tối thiểu 1, không trùng phần tử (CHECK subset ở
   * DB không chặn được trùng — DTO là lớp chặn). Bỏ trống = mặc định ['self_drive'].
   */
  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(SERVICE_TYPE_VALUES, { each: true })
  serviceTypes?: string[];

  @ApiPropertyOptional({ enum: VEHICLE_SOURCE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_SOURCE_TYPE_VALUES)
  sourceType?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '51K-123.45' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plateNumber?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Key hãng xe thuộc danh mục `vehicle_brand` (GET /catalog) — không phải tên tự do',
    example: 'vinfast',
  })
  @IsOptional()
  @IsString()
  @Matches(CATALOG_KEY_PATTERN, { message: 'brand phải là key trong danh mục hãng xe' })
  brand?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: MIN_YEAR, maximum: MAX_YEAR })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  manufactureYear?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 64 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  seatCount?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Key nhiên liệu thuộc danh mục `fuel_type` (GET /catalog)',
    example: 'gasoline',
  })
  @IsOptional()
  @IsString()
  @Matches(CATALOG_KEY_PATTERN, { message: 'fuelType phải là key trong danh mục nhiên liệu' })
  fuelType?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 30000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30000)
  lengthMm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  widthMm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  heightMm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  curbWeightKg?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 30000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30000)
  engineDisplacementCc?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  horsepowerHp?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: TRANSMISSION_TYPE_VALUES })
  @IsOptional()
  @IsIn(TRANSMISSION_TYPE_VALUES)
  transmission?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  fuelConsumptionCity?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  fuelConsumptionHighway?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  fuelConsumptionCombined?: number | null;

  // Các trường có thể GỠ giá trị (gửi null) — @IsOptional bỏ qua validate khi null,
  // service ghi null xuống DB để xoá (vd đổi ô tô → xe máy thì bỏ kiểu dáng).
  // `type: String` bắt buộc với field nullable — thiếu nó openapi-typescript sinh
  // `Record<string, never>` thay vì `string` (xem ghi chú ở `VehicleDto`).
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Key kiểu dáng thuộc danh mục `body_type` (GET /catalog) — chỉ với ô tô. Gửi null để xoá.',
    example: 'suv',
  })
  @IsOptional()
  @IsString()
  @Matches(CATALOG_KEY_PATTERN, { message: 'bodyType phải là key trong danh mục kiểu dáng' })
  bodyType?: string | null;

  @ApiPropertyOptional({ enum: VEHICLE_OPERATION_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_OPERATION_STATUS_VALUES)
  operationStatus?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'URL ảnh đại diện xe' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mainImageUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Giá ngày thường, string thập phân — ADR 0007',
    example: '600000',
  })
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Giá tháng tham chiếu thuê dài hạn (÷30 ra đơn giá ngày) — chỉ có nghĩa khi serviceTypes chứa long_term. Gửi null = bỏ giá tháng.',
    example: '8000000',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'monthlyPrice phải là số tiền hợp lệ' })
  monthlyPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Giá/ngày ĐÃ GỒM tài xế — chỉ có nghĩa khi serviceTypes chứa with_driver. Gửi null = shop báo giá khi duyệt.',
    example: '1500000',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'withDriverDailyPrice phải là số tiền hợp lệ' })
  withDriverDailyPrice?: string | null;

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
    type: String,
    description:
      'Key tiện ích thuộc danh mục `vehicle_feature` (GET /catalog) — thay toàn bộ khi gửi',
    example: ['bluetooth', 'gps'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FEATURES)
  @Matches(CATALOG_KEY_PATTERN, {
    each: true,
    message: 'features phải là key trong danh mục tiện ích',
  })
  features?: string[];
}

/**
 * Sửa xe — mọi trường optional. Vẫn KHÔNG có `publicStatus`: đổi trạng thái public đi qua
 * luồng duyệt (ADR 0008). `operationStatus` (sẵn sàng/bảo dưỡng/ngừng) là toggle vận hành
 * của gian hàng nên cho sửa ở đây.
 */
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

/**
 * Chỉ số vận hành + tài chính của MỘT xe, dùng cho thẻ xe ở `/manage/vehicles`.
 *
 * Tách khỏi `VehicleListItemDto` có chủ đích: danh sách xe được gọi ở nhiều nơi (dashboard,
 * calendar resources, picker trong form đơn) và không nơi nào cần tổng hợp nặng này. Gộp vào
 * sẽ bắt mọi consumer trả giá cho 3 truy vấn gộp nhóm mà họ không dùng.
 */
export class VehicleStatsDto {
  @ApiProperty()
  vehicleId!: string;

  @ApiProperty({ description: 'Đơn đang chạy — booking status = active' })
  activeBookings!: number;

  @ApiProperty({ description: 'Đơn đã hoàn thành — booking status = completed' })
  completedBookings!: number;

  @ApiPropertyOptional({
    description:
      'Tổng thu luỹ kế (phiếu thu đã duyệt), dạng string — ADR 0007. ' +
      'CHỈ trả khi người gọi có quyền `finance.view`; thiếu quyền thì trường vắng mặt.',
  })
  totalIncome?: string;

  @ApiPropertyOptional({ description: 'Tổng chi luỹ kế (phiếu chi đã duyệt), dạng string' })
  totalExpense?: string;
}

export class VehicleStatsListDto {
  @ApiProperty({ type: [VehicleStatsDto] })
  data!: VehicleStatsDto[];
}

export class VehicleStatsQueryDto {
  @ApiProperty({ description: 'Danh sách id xe, phân tách bằng dấu phẩy (tối đa 100)' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [],
  )
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * Tổng quan đội xe theo trạng thái vận hành — dải chỉ số đầu danh sách xe (Figma `236:4648`).
 *
 * Đếm ở DB (`groupBy`), không phụ thuộc trang/bộ lọc hiện tại: con số nói về CẢ đội xe.
 */
export class FleetSummaryDto {
  @ApiProperty({ description: 'Tổng số xe của gian hàng (không tính xe đã xoá mềm)' })
  total!: number;

  @ApiProperty({ description: 'Xe có operationStatus = available' })
  available!: number;

  @ApiProperty({ description: 'Xe có operationStatus = renting' })
  renting!: number;

  @ApiProperty({ description: 'Xe có operationStatus = maintenance' })
  maintenance!: number;

  @ApiProperty({ description: 'Xe có operationStatus = inactive' })
  inactive!: number;
}

/** Một đơn thuê rút gọn cho trang Hồ sơ 360 của xe — đủ cho thẻ "Lịch thuê sắp tới"/hoạt động. */
export class VehicleBookingBriefDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) totalAmount!: string;
  @ApiProperty({ description: 'ISO-8601 UTC — lần thay đổi gần nhất của đơn' }) updatedAt!: string;
}

/**
 * Tổng hợp cho trang Hồ sơ 360 (`/manage/vehicles/[id]`) — MỘT request thay vì FE tự ghép
 * stats + hai danh sách đơn (tránh bắn N request rời).
 *
 * Từng khối gate theo quyền Ở BACKEND: thiếu `bookings.view` thì hai danh sách đơn vắng mặt
 * khỏi response (không chạy truy vấn), thiếu `finance.view` thì `stats` không mang số tiền.
 */
export class Vehicle360SummaryDto {
  @ApiProperty({ type: VehicleStatsDto })
  stats!: VehicleStatsDto;

  @ApiPropertyOptional({
    type: [VehicleBookingBriefDto],
    description: 'Đơn sắp tới/đang chạy (tối đa 3, sớm nhất trước) — chỉ khi có `bookings.view`',
  })
  upcomingBookings?: VehicleBookingBriefDto[];

  @ApiPropertyOptional({
    type: [VehicleBookingBriefDto],
    description: 'Đơn thay đổi gần nhất (tối đa 3, mới nhất trước) — chỉ khi có `bookings.view`',
  })
  recentBookings?: VehicleBookingBriefDto[];

  // ── Việc cần làm + KM (Wave 8) ────────────────────────────────────────────
  // Cùng `VehicleAlertsService` với `GET /vehicles/alerts` của lưới danh sách: một phép tính,
  // hai bề mặt. Nội dung đã lọc dữ liệu nhạy cảm ngay ở service.
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'KM hiện tại — null = chưa từng ghi nhận, KHÔNG phải 0 km',
  })
  currentOdometerKm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '@xeprime/types → OdometerSource' })
  currentOdometerSource?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  currentOdometerAt?: string | null;

  @ApiPropertyOptional({ type: [VehicleAlertDto], description: 'Đã sắp theo ưu tiên tất định' })
  alerts?: VehicleAlertDto[];
}
