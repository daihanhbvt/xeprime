import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_STATUS_VALUES,
  CUSTOMER_DOCUMENT_TYPE_VALUES,
  IDENTITY_VERIFY_METHOD_VALUES,
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  SERVICE_TYPE_VALUES,
  TENANT_CUSTOMER_NOTE_TYPE_VALUES,
  TENANT_CUSTOMER_RELATIONSHIP_VALUES,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
  TENANT_CUSTOMER_SORT_VALUES,
  TENANT_CUSTOMER_SOURCE_VALUES,
  VN_PHONE_PATTERN,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Lịch sử thuê là danh sách riêng, trần thấp hơn — nó nằm trong một tab, không phải cả trang. */
const HISTORY_DEFAULT_LIMIT = 10;
const HISTORY_MAX_LIMIT = 50;

export {
  DEFAULT_LIMIT as CUSTOMER_DEFAULT_LIMIT,
  MAX_LIMIT as CUSTOMER_MAX_LIMIT,
  HISTORY_DEFAULT_LIMIT as CUSTOMER_HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT as CUSTOMER_HISTORY_MAX_LIMIT,
};

export class TenantCustomerListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên / SĐT (mọi định dạng) / email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    enum: TENANT_CUSTOMER_RELATIONSHIP_VALUES,
    description:
      'Nhóm quan hệ. `has_debt` là bộ lọc tài chính — thiếu `finance.view` sẽ bị từ chối, ' +
      'không âm thầm trả về danh sách đầy đủ.',
  })
  @IsOptional()
  @IsIn(TENANT_CUSTOMER_RELATIONSHIP_VALUES)
  relationship?: string;

  @ApiPropertyOptional({
    enum: TENANT_CUSTOMER_SORT_VALUES,
    description: '`total_value` và `debt` là sắp xếp tài chính — gate như bộ lọc trên.',
  })
  @IsOptional()
  @IsIn(TENANT_CUSTOMER_SORT_VALUES)
  sort?: string;

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

/**
 * Số liệu tổng hợp của một khách — TÍNH ĐỘNG từ `bookings` mỗi lần đọc (không cột đếm nào
 * được denormalize, cùng kỷ luật với công nợ ở Phase 6).
 *
 * Ba trường tiền là `null` khi người gọi KHÔNG có `finance.view`. `null` chứ không phải `'0'`:
 * "không được xem" và "bằng không" là hai chuyện khác nhau, và FE phải ẩn hẳn ô thay vì hiển
 * thị một số 0 sai sự thật.
 */
export class TenantCustomerStatsDto {
  @ApiProperty({ description: 'Số chuyến đã HOÀN TẤT' }) completedRentalCount!: number;
  @ApiProperty({ description: 'Đơn đang giữ chỗ / đang thuê (reserved · confirmed · active)' })
  activeBookingCount!: number;
  @ApiProperty({ description: 'Số lần khách không tới nhận xe' }) noShowCount!: number;
  @ApiProperty({
    description: 'Số chuyến trả xe MUỘN — chỉ đếm khi có `actual_return_at` thật, không suy đoán',
  })
  lateReturnCount!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC · null = chưa thuê lần nào',
  })
  lastRentalAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Tổng giá trị đơn KHÔNG tính đơn huỷ (chuỗi thập phân) · null = thiếu finance.view',
  })
  totalBookingAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đã thu · null = thiếu finance.view',
  })
  paidAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Còn nợ = Σ max(total − paid, 0) · null = thiếu finance.view',
  })
  debtAmount!: string | null;
}

export class TenantCustomerListItemDto extends TenantCustomerStatsDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ description: 'SĐT dạng hiển thị (`0…`)' }) phone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ enum: TENANT_CUSTOMER_RISK_LEVEL_VALUES }) riskLevel!: string;
  @ApiProperty({ enum: TENANT_CUSTOMER_SOURCE_VALUES }) source!: string;
  @ApiProperty({ description: 'Đã liên kết tài khoản trên nền tảng' }) hasAccount!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — null = đang hoạt động' })
  archivedAt!: string | null;
}

export class TenantCustomerPageDto {
  @ApiProperty({ type: [TenantCustomerListItemDto] }) data!: TenantCustomerListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Dải KPI đầu trang. `totalDebt` `null` khi thiếu `finance.view` (FE ẩn hẳn ô, không hiện 0). */
export class TenantCustomerSummaryDto {
  @ApiProperty({ description: 'Khách đang hoạt động (chưa lưu trữ)' }) activeCustomers!: number;
  @ApiProperty({ description: 'Khách quen — từ 2 chuyến hoàn tất trở lên' })
  returningCustomers!: number;
  @ApiProperty() watchlistCustomers!: number;
  @ApiProperty() blockedCustomers!: number;
  @ApiProperty() archivedCustomers!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) totalDebt!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Số khách còn nợ · null khi thiếu finance.view — FE ẩn hẳn ô, không hiện 0',
  })
  debtCustomers!: number | null;
}

export class CreateTenantCustomerDto {
  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @Length(1, 255)
  fullName!: string;

  @ApiProperty({
    example: '0901234567',
    description:
      'Bắt buộc — SĐT là định danh của khách trong sổ khách. Server chuẩn hoá trước khi lưu.',
  })
  @IsString()
  @Matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((o: CreateTenantCustomerDto) => Boolean(o.email))
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
}

/** Sửa hồ sơ. Mọi trường optional; trường không gửi giữ nguyên (không bị null hoá). */
export class UpdateTenantCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Đổi sang SĐT đã thuộc khách khác → 409 CUSTOMER_PHONE_DUPLICATE',
  })
  @IsOptional()
  @IsString()
  @Matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((o: UpdateTenantCustomerDto) => Boolean(o.email))
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
}

/** Đổi mức rủi ro. `watchlist`/`blocked` BẮT BUỘC kèm lý do (DB cũng có CHECK). */
export class UpdateCustomerRiskDto {
  @ApiProperty({ enum: TENANT_CUSTOMER_RISK_LEVEL_VALUES })
  @IsIn(TENANT_CUSTOMER_RISK_LEVEL_VALUES)
  riskLevel!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lý do NỘI BỘ — bắt buộc khi khác `normal`. Không bao giờ hiển thị cho khách.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

/** Một dòng lịch sử thuê. Ba trường tiền `null` khi thiếu `finance.view`. */
export class CustomerBookingItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlate!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) totalAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) debtAmount!: string | null;
}

export class CustomerBookingPageDto {
  @ApiProperty({ type: [CustomerBookingItemDto] }) data!: CustomerBookingItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class CustomerBookingListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: HISTORY_DEFAULT_LIMIT,
    minimum: 1,
    maximum: HISTORY_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_LIMIT)
  limit?: number;
}

export class TenantCustomerDetailDto extends TenantCustomerStatsDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ description: 'Dạng chuẩn hoá — định danh khách trong gian hàng này' })
  normalizedPhone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ enum: TENANT_CUSTOMER_SOURCE_VALUES }) source!: string;
  @ApiProperty({ enum: TENANT_CUSTOMER_RISK_LEVEL_VALUES }) riskLevel!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lý do rủi ro — NỘI BỘ, chỉ đi tới người trong gian hàng',
  })
  riskReason!: string | null;
  @ApiProperty() hasAccount!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) archivedAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
  @ApiProperty({
    type: [CustomerBookingItemDto],
    description: 'Hoạt động gần đây (tối đa 5). Rỗng khi người gọi không có `bookings.view`.',
  })
  recentBookings!: CustomerBookingItemDto[];
}

export class CustomerNoteDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TENANT_CUSTOMER_NOTE_TYPE_VALUES }) noteType!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Người ghi · null = tài khoản đã xoá',
  })
  authorName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class CustomerNotePageDto {
  @ApiProperty({ type: [CustomerNoteDto] }) data!: CustomerNoteDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class CreateCustomerNoteDto {
  @ApiProperty({ enum: TENANT_CUSTOMER_NOTE_TYPE_VALUES })
  @IsIn(TENANT_CUSTOMER_NOTE_TYPE_VALUES)
  noteType!: string;

  @ApiProperty({ description: 'Nội dung ghi chú nội bộ' })
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export class CustomerDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CUSTOMER_DOCUMENT_TYPE_VALUES }) documentType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customTypeName!: string | null;
  @ApiProperty({ description: 'Tên file gốc (hiển thị) — KHÔNG phải đường dẫn lưu trữ' })
  originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn giấy tờ (YYYY-MM-DD)' })
  expiresAt!: string | null;
  @ApiProperty({
    description: 'Suy từ `expiresAt` lúc đọc: no_expiry | valid | expiring_soon | expired',
  })
  expiryStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) uploadedByName!: string | null;
  /** ISO — null = CHƯA đối chiếu. Ba trường verify* đi cùng nhau (CHECK ở DB). */
  @ApiPropertyOptional({ type: String, nullable: true }) verifiedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) verifiedByName!: string | null;
  @ApiPropertyOptional({ enum: IDENTITY_VERIFY_METHOD_VALUES, type: String, nullable: true })
  verifyMethod!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) verifyNote!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/**
 * Ghi nhận đối chiếu giấy tờ. KHÔNG có cờ "đạt/không đạt": giấy tờ không đối chiếu được thì
 * không ghi nhận gì cả (và badge trên màn đơn vẫn báo thiếu) — một bản ghi "đã đối chiếu:
 * không đạt" chỉ tạo ra trạng thái thứ ba mà không luồng nào xử lý.
 */
export class VerifyCustomerDocumentDto {
  @ApiProperty({ enum: IDENTITY_VERIFY_METHOD_VALUES })
  @IsIn(IDENTITY_VERIFY_METHOD_VALUES)
  verifyMethod!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ghi chú khi đối chiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  verifyNote?: string | null;
}

export class PresignCustomerDocumentDto {
  @ApiProperty({ enum: CUSTOMER_DOCUMENT_TYPE_VALUES })
  @IsIn(CUSTOMER_DOCUMENT_TYPE_VALUES)
  documentType!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chỉ dùng khi documentType = other',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customTypeName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn giấy tờ (YYYY-MM-DD)' })
  @IsOptional()
  @ValidateIf((o: PresignCustomerDocumentDto) => o.expiresAt !== null)
  @Matches(DATE_ONLY_PATTERN, { message: 'Hạn giấy tờ phải theo dạng YYYY-MM-DD' })
  expiresAt?: string | null;

  @ApiProperty({ description: 'Tên file gốc (chỉ để hiển thị, không tham gia định danh)' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ enum: DOCUMENT_UPLOAD_MIME_TYPES })
  @IsIn(DOCUMENT_UPLOAD_MIME_TYPES)
  contentType!: string;

  @ApiProperty({ description: `Dung lượng (byte), tối đa ${DOCUMENT_UPLOAD_MAX_BYTES}` })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DOCUMENT_UPLOAD_MAX_BYTES)
  fileSize!: number;
}

export class CustomerDocumentPresignDto {
  @ApiProperty({ description: 'ID bản ghi giấy tờ — dùng cho bước hoàn tất' }) documentId!: string;
  @ApiProperty({ description: 'URL PUT lên bucket riêng tư (hết hạn ngắn)' }) uploadUrl!: string;
  @ApiProperty() expiresIn!: number;
}

export class CustomerDocumentDownloadDto {
  @ApiProperty({ description: 'Signed GET URL ngắn hạn — không cache, không lưu' })
  downloadUrl!: string;
  @ApiProperty({ description: 'ISO — thời điểm URL hết hiệu lực' }) expiresAt!: string;
}
