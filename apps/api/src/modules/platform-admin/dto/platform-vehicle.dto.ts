import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPROVAL_STATUS_VALUES,
  DEFAULT_PLATFORM_VEHICLE_SORT,
  LISTING_STATUS_VALUES,
  MARKETPLACE_VISIBILITY_REASON_VALUES,
  PLATFORM_VEHICLE_SORT_VALUES,
  SERVICE_TYPE_VALUES,
  TENANT_STATUS_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
  type PlatformVehicleSort,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { toQueryBool } from '../../../common/dto/query-transforms';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_VEHICLE_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_VEHICLE_MAX_LIMIT };

/** Lọc xe toàn hệ thống (admin nền tảng). Mọi filter là AND. */
export class PlatformVehicleListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên xe / biển số / mã xe' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;

  @ApiPropertyOptional({ enum: VEHICLE_PUBLIC_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_PUBLIC_STATUS_VALUES)
  publicStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_OPERATION_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_OPERATION_STATUS_VALUES)
  operationStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({
    enum: SERVICE_TYPE_VALUES,
    description: 'Xe phục vụ được dịch vụ này (một xe đăng nhiều dịch vụ)',
  })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  /**
   * Tỉnh/thành của CHI NHÁNH gắn xe — nguồn vị trí công khai của xe (cùng cột `public_listings`
   * đọc), không phải `tenant_profiles.province_name` (chuỗi tự do, một gian hàng có xe ở nhiều tỉnh).
   */
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành của chi nhánh gắn xe (`provinces.code`)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  provinceCode?: string;

  @ApiPropertyOptional({ enum: TENANT_STATUS_VALUES, description: 'Trạng thái gian hàng chủ xe' })
  @IsOptional()
  @IsIn(TENANT_STATUS_VALUES)
  tenantStatus?: string;

  /**
   * Lọc theo KẾT QUẢ hiển thị thật ngoài chợ, không theo một trạng thái lẻ nào (ADR 0048).
   *
   * `publicStatus = approved_public` KHÔNG phải câu trả lời: một chiếc xe đã duyệt vẫn biến khỏi
   * chợ khi chủ xe tắt công tắc, hoặc khi gian hàng bị khoá. Lọc bằng cột đó rồi gắn nhãn "Đang
   * hiển thị" là đưa cho người kiểm duyệt một danh sách có lẫn xe không ai thấy — và họ sẽ kết
   * luận sai về đúng cái việc họ đang soát.
   *
   * Vị từ dùng lại `marketplaceVehicleWhere()` — CÙNG bốn vế mà các đường đọc công khai dùng, nên
   * bộ lọc của admin không thể nói khác với thứ khách thật sự tìm được.
   */
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true = chỉ xe ĐANG THẬT SỰ hiện ngoài chợ (đã duyệt + chủ xe bật + gian hàng hoạt động); ' +
      'false = mọi xe không hiện',
  })
  @IsOptional()
  @Transform(toQueryBool)
  @IsBoolean()
  marketplaceVisible?: boolean;

  @ApiPropertyOptional({ enum: PLATFORM_VEHICLE_SORT_VALUES, default: DEFAULT_PLATFORM_VEHICLE_SORT })
  @IsOptional()
  @IsIn(PLATFORM_VEHICLE_SORT_VALUES)
  sort?: PlatformVehicleSort;

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

/** Một xe trong danh sách giám sát — kèm chủ sở hữu và trạng thái listing trên sàn. */
export class PlatformVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true }) serviceTypes!: string[];
  @ApiProperty({ enum: VEHICLE_PUBLIC_STATUS_VALUES }) publicStatus!: string;
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tiền dạng string (ADR 0007)',
  })
  weekdayPrice!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) tenantStatus!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tỉnh/thành của chi nhánh gắn xe — vị trí công khai của xe',
  })
  provinceName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: LISTING_STATUS_VALUES,
    description: 'Trạng thái snapshot trên Marketplace; null = xe chưa từng lên sàn',
  })
  listingStatus!: string | null;
  /**
   * Lựa chọn HIỂN THỊ của chủ xe (ADR 0048) — CHỈ ĐỌC với nền tảng; không endpoint admin nào
   * ghi vào nó.
   *
   * Có mặt vì nếu thiếu, bảng xe toàn hệ thống trả về một bộ ba `publicStatus` +
   * `listingStatus` không giải thích được cho nhau: bỏ ẩn xong mà `listingStatus` vẫn `hidden`
   * là ĐÚNG khi chủ xe đang tắt, nhưng nhìn từ payload thì giống một lỗi đồng bộ.
   */
  @ApiProperty({ description: 'Chủ xe có đang cho xe hiện ngoài chợ không (ADR 0048)' })
  marketplaceEnabled!: boolean;

  /**
   * KẾT QUẢ hiển thị thật + LÝ DO, do SERVER suy (ADR 0048 điều 5).
   *
   * Màn kiểm duyệt không được tự ghép lại từ `publicStatus` + `marketplaceEnabled` +
   * `tenantStatus`: đó là bản sao thứ ba của cùng một luật, và bản sai luôn là bản người kiểm
   * duyệt đang đọc khi họ quyết định gỡ ẩn một chiếc xe.
   */
  @ApiProperty({ description: 'Khách có thật sự thấy xe này không' })
  isMarketplaceVisible!: boolean;

  @ApiProperty({
    enum: MARKETPLACE_VISIBILITY_REASON_VALUES,
    description: 'Vì sao xe đang (không) hiện ngoài chợ',
  })
  marketplaceVisibilityReason!: string;

  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/**
 * Số xe của từng GÓC NHÌN nhanh — tính trong CÙNG lần đọc với danh sách và trong phạm vi các bộ
 * lọc còn lại (tìm kiếm, loại xe, dịch vụ, tỉnh, vận hành, gian hàng). Khoá là
 * `PLATFORM_VEHICLE_VIEW` của `@xeprime/types`.
 */
export class PlatformVehicleCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty({ description: 'Đang thật sự hiện ngoài chợ (ADR 0048)' }) visible!: number;
  @ApiProperty({ description: 'Chờ nền tảng duyệt' }) pending_review!: number;
  @ApiProperty({ description: 'Nền tảng đã ẩn' }) platform_hidden!: number;
  @ApiProperty({ description: 'Thuộc gian hàng bị khoá' }) suspended_shop!: number;
}

export class PlatformVehiclePageDto {
  @ApiProperty({ type: [PlatformVehicleDto] }) data!: PlatformVehicleDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
  @ApiProperty({ type: PlatformVehicleCountsDto }) counts!: PlatformVehicleCountsDto;
}

/** Phiếu duyệt GẦN NHẤT của xe — để màn giám sát trỏ sang đúng hồ sơ ở màn Duyệt xe. */
export class PlatformVehicleApprovalRefDto {
  @ApiProperty() taskId!: string;
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  reviewedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lý do gửi chủ xe' })
  reason!: string | null;
}

/**
 * Lượt nền tảng ẨN xe đang còn hiệu lực — đọc từ `audit_logs` (`vehicle.platform_hide`), chỉ
 * có khi `publicStatus = hidden`. Người kiểm duyệt phải thấy VÌ SAO và AI đã ẩn trước khi gỡ.
 */
export class PlatformVehicleHideDto {
  @ApiProperty({ description: 'Lý do đã ghi lúc ẩn' }) reason!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) hiddenAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) hiddenByName!: string | null;
}

/** Chi tiết một xe (panel giám sát) — thêm ảnh, thông số, giá còn lại, vị trí và số liệu vận hành. */
export class PlatformVehicleDetailDto extends PlatformVehicleDto {
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) transmission!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  /** Ảnh đại diện đứng đầu, rồi gallery theo `sort_order`; không trùng URL. */
  @ApiProperty({ type: [String] }) images!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) weekendPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hourlyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) monthlyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) withDriverDailyPrice!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: '% giảm giá đang chạy' })
  discountPercent!: number | null;
  @ApiProperty() deliveryEnabled!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chi nhánh gắn xe' })
  branchName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Địa chỉ chi nhánh gắn xe' })
  branchAddress!: string | null;
  @ApiProperty() tenantSlug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerPhone!: string | null;
  @ApiProperty({ description: 'Số đơn thuê đã phát sinh trên xe' }) bookingCount!: number;
  @ApiProperty({ description: 'Số đánh giá của xe' }) reviewCount!: number;
  @ApiPropertyOptional({ type: PlatformVehicleApprovalRefDto, nullable: true })
  latestApproval!: PlatformVehicleApprovalRefDto | null;
  @ApiPropertyOptional({ type: PlatformVehicleHideDto, nullable: true })
  platformHide!: PlatformVehicleHideDto | null;
}

/** Lý do ẩn xe — bắt buộc: đây là hành động kiểm duyệt, phải giải trình được trong audit. */
export class HideVehicleDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do ẩn (ghi vào audit log)' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
