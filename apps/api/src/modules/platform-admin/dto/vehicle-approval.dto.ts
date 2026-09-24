import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPROVAL_INTERNAL_NOTE_MAX_LENGTH,
  APPROVAL_REASON_MAX_LENGTH,
  APPROVAL_STATUS_VALUES,
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_MODE_VALUES,
  POLICY_SOURCE_VALUES,
  PUBLISH_REQUIREMENT_VALUES,
  SERVICE_TYPE_VALUES,
  STOREFRONT_KIND_VALUES,
  VEHICLE_REVIEW_BASIS_VALUES,
  VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS,
  VEHICLE_REVIEW_CHECK_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { ApprovalLogEntryDto } from './approval.dto';

export const VEHICLE_APPROVAL_DEFAULT_LIMIT = 20;
export const VEHICLE_APPROVAL_MAX_LIMIT = 100;
/** Trần độ dài chuỗi tìm — đủ cho tên xe dài nhất, chặn một câu truy vấn trigram vô nghĩa. */
export const VEHICLE_APPROVAL_SEARCH_MAX = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ---------------------------------------------------------------------------
// Danh sách
// ---------------------------------------------------------------------------

/**
 * Bộ lọc hàng đợi "Duyệt xe". MỌI chiều áp ở DB TRƯỚC khi đếm và phân trang — không chiều nào
 * được lọc trên một trang đã cắt (một trang 20 dòng lọc còn 3 là một con số tổng nói dối).
 *
 * `status` bỏ trống = mọi trạng thái (lịch sử). Màn web mặc định gửi `pending`.
 */
export class VehicleApprovalListQueryDto {
  @ApiPropertyOptional({ enum: APPROVAL_STATUS_VALUES })
  @IsOptional()
  @IsIn(APPROVAL_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ enum: STOREFRONT_KIND_VALUES, description: 'Nguồn đăng lúc gửi' })
  @IsOptional()
  @IsIn(STOREFRONT_KIND_VALUES)
  storefrontKind?: string;

  @ApiPropertyOptional({
    maxLength: VEHICLE_APPROVAL_SEARCH_MAX,
    description: 'Tên xe, mã xe hoặc biển số (không phân biệt hoa thường)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(VEHICLE_APPROVAL_SEARCH_MAX)
  q?: string;

  @ApiPropertyOptional({ description: 'Gửi từ thời điểm (ISO-8601, bao gồm)' })
  @IsOptional()
  @IsISO8601()
  submittedFrom?: string;

  @ApiPropertyOptional({ description: 'Gửi đến thời điểm (ISO-8601, bao gồm)' })
  @IsOptional()
  @IsISO8601()
  submittedTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: VEHICLE_APPROVAL_DEFAULT_LIMIT,
    minimum: 1,
    maximum: VEHICLE_APPROVAL_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(VEHICLE_APPROVAL_MAX_LIMIT)
  limit?: number;
}

/** Một dòng hàng đợi — giá trị CHỤP lúc gửi (`approval_vehicle_subjects`), không phải xe sống. */
export class VehicleApprovalListItemDto {
  @ApiProperty() approvalTaskId!: string;
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) approvalStatus!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleCode!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
  @ApiProperty({ enum: STOREFRONT_KIND_VALUES }) storefrontKind!: string;
  @ApiProperty({ description: 'Tên gian hàng / chủ xe lúc gửi' }) sourceName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) submittedByName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
}

/**
 * Số phiếu cho ba tab loại xe — đếm với MỌI bộ lọc khác đang áp (trạng thái, nguồn đăng, tìm,
 * ngày gửi) trừ chính loại xe, trong CÙNG lần đọc với danh sách: tab và danh sách không bao giờ
 * nói hai con số khác nhau.
 */
export class VehicleApprovalCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() car!: number;
  @ApiProperty() motorbike!: number;
}

export class VehicleApprovalPageDto {
  @ApiProperty({ type: [VehicleApprovalListItemDto] }) data!: VehicleApprovalListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
  @ApiProperty({ type: VehicleApprovalCountsDto }) counts!: VehicleApprovalCountsDto;
}

// ---------------------------------------------------------------------------
// Chi tiết — hình dạng `VehicleReviewSnapshot` (@xeprime/types)
// ---------------------------------------------------------------------------

export class VehicleApprovalVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true }) serviceTypes!: string[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Khoá danh mục hãng' })
  brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bodyType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) motorbikeCategory!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) transmission!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'lít/100km — Decimal dạng chuỗi',
  })
  fuelConsumptionCombined!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) engineDisplacementCc!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) electricRangeKm!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'kWh — Decimal dạng chuỗi' })
  batteryCapacityKwh!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'kWh/100km' })
  electricConsumptionKwhPer100Km!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
  @ApiProperty({ type: [String], description: 'Toàn bộ ảnh lúc gửi, ảnh đại diện đứng đầu' })
  images!: string[];
  @ApiProperty({ type: [String], description: 'Khoá tiện nghi (danh mục vehicle_feature)' })
  features!: string[];
}

export class VehicleApprovalPricingDto {
  @ApiPropertyOptional({ type: String, nullable: true }) weekdayPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) weekendPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hourlyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) monthlyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) withDriverDailyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) withDriverInterCityPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) withDriverOneWayPrice!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) discountPercent!: number | null;
}

export class VehicleApprovalServiceDto {
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() autoAcceptEnabled!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) termsText!: string | null;
}

export class VehicleApprovalDeliveryTierDto {
  @ApiProperty() toKm!: number;
  @ApiProperty({ description: "VND — '0' là miễn phí" }) fee!: string;
}

export class VehicleApprovalDiscountTierDto {
  @ApiProperty() minMonths!: number;
  @ApiProperty() percent!: number;
}

export class VehicleApprovalPolicyDto {
  @ApiProperty({ enum: POLICY_SOURCE_VALUES }) source!: string;
  @ApiProperty({ enum: COLLATERAL_MODE_VALUES }) collateralMode!: string;
  @ApiProperty({ enum: COLLATERAL_ASSET_TYPE_VALUES, isArray: true })
  collateralAssetTypes!: string[];
  @ApiProperty() depositAmount!: string;
  @ApiProperty() deliveryEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) deliveryMaxRadiusKm!: number | null;
  @ApiProperty({ type: [VehicleApprovalDeliveryTierDto] })
  deliveryTiers!: VehicleApprovalDeliveryTierDto[];
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  includedDistanceKmPerDay!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) excessDistanceFeePerKm!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) overtimeFeePerHour!: string | null;
  @ApiProperty() discountEnabled!: boolean;
  @ApiProperty({ type: [VehicleApprovalDiscountTierDto] })
  discountTiers!: VehicleApprovalDiscountTierDto[];
}

export class VehicleApprovalPickupDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) wardName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
}

export class VehicleApprovalSourceDto {
  @ApiProperty({ enum: STOREFRONT_KIND_VALUES }) storefrontKind!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() name!: string;
}

/**
 * Một con người liên quan tới phiếu — CHỦ XE (chủ gian hàng) hoặc NGƯỜI GỬI (có thể là nhân viên).
 * Đọc SỐNG từ tài khoản: đây là thông tin để LIÊN HỆ, và số điện thoại hôm nay mới là số gọi được.
 *
 * KHÔNG che như SĐT khách (`maskPhone` ở màn khách/đơn): đây là liên hệ phía NGƯỜI BÁN, và người
 * duyệt cần gọi được họ để xác minh — đúng mức mà hàng đợi duyệt đã mở cho `platform.approval.review`
 * từ trước (SĐT/email gian hàng ở phiếu chung, SĐT chủ trong snapshot xác minh gian hàng).
 */
export class VehicleApprovalPersonDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
}

export class VehicleApprovalCheckDto {
  @ApiProperty({ enum: VEHICLE_REVIEW_CHECK_VALUES }) key!: string;
  @ApiProperty() passed!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  updatedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) updatedByName!: string | null;
}

export class VehicleApprovalInternalNoteDto {
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — gửi lại ở `expectedUpdatedAt` khi lưu',
  })
  updatedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) updatedByName!: string | null;
}

/**
 * Vì sao xe HIỆN TẠI chưa phê duyệt được, dù danh mục đã đủ — cùng phép so mà cổng backend dùng
 * (`vehicleApprovalBlockers`), trả sẵn để giao diện nói TRƯỚC khi người duyệt bấm. Luôn rỗng với
 * phiếu đã xử lý.
 */
export class VehicleApprovalBlockersDto {
  @ApiProperty({
    enum: PUBLISH_REQUIREMENT_VALUES,
    isArray: true,
    description: 'Điều kiện lên chợ xe hiện tại không còn đạt',
  })
  missingRequirements!: string[];
  @ApiProperty({
    enum: [...VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS],
    isArray: true,
    description: 'Trường căn cước đã bị sửa sau khi gửi duyệt',
  })
  changedLockedFields!: string[];
}

export class VehicleApprovalDetailDto {
  @ApiProperty() approvalTaskId!: string;
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) approvalStatus!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedByName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lý do của quyết định gần nhất (đã gửi chủ xe)',
  })
  reason!: string | null;

  @ApiProperty({
    enum: VEHICLE_REVIEW_BASIS_VALUES,
    description: '`snapshot` = ảnh chụp lúc gửi; `live` = phiếu cũ, dữ liệu HIỆN TẠI của xe',
  })
  basis!: string;
  @ApiProperty({ description: 'Thời điểm của dữ liệu đang hiển thị (ISO-8601 UTC)' })
  capturedAt!: string;

  @ApiProperty({ type: VehicleApprovalVehicleDto }) vehicle!: VehicleApprovalVehicleDto;
  @ApiProperty({ type: VehicleApprovalPricingDto }) pricing!: VehicleApprovalPricingDto;
  @ApiProperty({ type: [VehicleApprovalServiceDto] }) services!: VehicleApprovalServiceDto[];
  @ApiPropertyOptional({ type: VehicleApprovalPolicyDto, nullable: true })
  policy!: VehicleApprovalPolicyDto | null;
  @ApiPropertyOptional({ type: VehicleApprovalPickupDto, nullable: true })
  pickup!: VehicleApprovalPickupDto | null;
  @ApiProperty({ type: VehicleApprovalSourceDto }) source!: VehicleApprovalSourceDto;
  @ApiProperty({ type: VehicleApprovalBlockersDto })
  approvalBlockers!: VehicleApprovalBlockersDto;

  @ApiPropertyOptional({ type: VehicleApprovalPersonDto, nullable: true })
  owner!: VehicleApprovalPersonDto | null;
  @ApiProperty({ type: VehicleApprovalPersonDto }) submitter!: VehicleApprovalPersonDto;

  @ApiProperty({
    type: [VehicleApprovalCheckDto],
    description: 'Đủ năm mục theo thứ tự hiển thị — mục chưa từng đánh dấu là passed=false',
  })
  manualChecks!: VehicleApprovalCheckDto[];
  @ApiProperty({ type: VehicleApprovalInternalNoteDto })
  internalNote!: VehicleApprovalInternalNoteDto;

  @ApiProperty({ type: [ApprovalLogEntryDto] }) logs!: ApprovalLogEntryDto[];
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export class SetVehicleApprovalCheckDto {
  @ApiProperty() @IsBoolean() passed!: boolean;
}

export class VehicleApprovalChecksDto {
  @ApiProperty({ type: [VehicleApprovalCheckDto] }) items!: VehicleApprovalCheckDto[];
}

export class SaveApprovalInternalNoteDto {
  @ApiProperty({
    maxLength: APPROVAL_INTERNAL_NOTE_MAX_LENGTH,
    description: 'Chuỗi rỗng = xoá ghi chú',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(APPROVAL_INTERNAL_NOTE_MAX_LENGTH)
  note!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      '`updatedAt` của ghi chú lúc bạn tải phiếu (null nếu chưa có ghi chú). Lệch với bản đang lưu ⇒ 409 APPROVAL_NOTE_CONFLICT',
  })
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsISO8601()
  expectedUpdatedAt?: string | null;
}

/** Lý do gửi CHỦ XE — bắt buộc khi từ chối / yêu cầu bổ sung. */
export class VehicleApprovalReasonDto {
  @ApiProperty({ maxLength: APPROVAL_REASON_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(APPROVAL_REASON_MAX_LENGTH)
  reason!: string;
}
