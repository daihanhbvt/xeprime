import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LISTING_STATUS_VALUES,
  MARKETPLACE_VISIBILITY_REASON_VALUES,
  SERVICE_TYPE_VALUES,
  TENANT_STATUS_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_VEHICLE_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_VEHICLE_MAX_LIMIT };

/** Query param boolean-ish (`1`/`true`) → boolean; giá trị lạ giữ nguyên để `@IsBoolean` chặn. */
const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

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
  @Transform(toBool)
  @IsBoolean()
  marketplaceVisible?: boolean;

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
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số tiền dạng string (ADR 0007)' })
  weekdayPrice!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) tenantStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
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
}

export class PlatformVehiclePageDto {
  @ApiProperty({ type: [PlatformVehicleDto] }) data!: PlatformVehicleDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Chi tiết một xe (drawer giám sát) — thêm thông số, giá còn lại và số liệu vận hành. */
export class PlatformVehicleDetailDto extends PlatformVehicleDto {
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) weekendPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hourlyPrice!: string | null;
  @ApiProperty() tenantSlug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiProperty({ description: 'Số đơn thuê đã phát sinh trên xe' }) bookingCount!: number;
  @ApiProperty({ description: 'Số đánh giá của xe' }) reviewCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/** Lý do ẩn xe — bắt buộc: đây là hành động kiểm duyệt, phải giải trình được trong audit. */
export class HideVehicleDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do ẩn (ghi vào audit log)' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
