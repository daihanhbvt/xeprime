import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_STATUS_VALUES,
  FINANCE_CATEGORY_TYPE_VALUES,
  PAYMENT_METHOD_VALUES,
  RECEIPT_SOURCE_VALUES,
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

  @ApiPropertyOptional({ enum: RECEIPT_SOURCE_VALUES, description: 'Lọc theo nguồn sinh phiếu' })
  @IsOptional()
  @IsIn(RECEIPT_SOURCE_VALUES)
  source?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHOD_VALUES, description: 'Lọc theo hình thức' })
  @IsOptional()
  @IsIn(PAYMENT_METHOD_VALUES)
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Lọc theo đơn thuê' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo xe' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo khách của gian hàng' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  tenantCustomerId?: string;

  @ApiPropertyOptional({ description: 'Tìm mã phiếu / mã tra soát / diễn giải / mã đơn' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Từ ngày — `YYYY-MM-DD` (trọn ngày theo giờ VN) hoặc ISO đầy đủ. Lọc `occurred_at`',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày — cùng quy ước với `from`' })
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
  @ApiProperty({
    enum: RECEIPT_TYPE_VALUES,
    description: 'income = phiếu thu, expense = phiếu chi',
  })
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

  @ApiPropertyOptional({
    description:
      'Ngày tiền phát sinh (ISO hoặc YYYY-MM-DD); mặc định bây giờ. Nhập bù cho hôm trước thì đặt đúng ngày đó.',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

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
  @ApiProperty({
    enum: RECEIPT_SOURCE_VALUES,
    description: 'Nguồn sinh phiếu — `manual` mới sửa/huỷ tay được',
  })
  source!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Id bản ghi nghiệp vụ gốc' })
  sourceRefId!: string | null;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) amount!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) categoryId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) categoryName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantCustomerId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) customerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({
    description: 'Ngày tiền di chuyển, ISO-8601 UTC — mọi lọc/tổng hợp chạy trên cột này',
  })
  occurredAt!: string;
  @ApiProperty({ description: 'Lúc nhập vào máy, ISO-8601 UTC' }) createdAt!: string;
}

export class ReceiptDetailDto extends ReceiptListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) referenceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) requestedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) approvedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) approvedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelledByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelledAt!: string | null;
  @ApiProperty({ type: [String], description: 'URL ảnh minh chứng' }) attachments!: string[];
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

export class ReceiptPageDto {
  @ApiProperty({ type: [ReceiptListItemDto] }) data!: ReceiptListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

// --- Công nợ + dashboard ---------------------------------------------------

export const DEBT_FILTER = ['all', 'overdue', 'upcoming', 'unpaid'] as const;

export class DebtListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã đơn / tên khách / SĐT / tên xe / biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: DEBT_FILTER, default: 'all' })
  @IsOptional()
  @IsIn(DEBT_FILTER)
  filter?: string;

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

export class DebtItemDto {
  @ApiProperty() bookingId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
  @ApiProperty() vehicleName!: string;

  /**
   * Trạng thái đơn — thứ phân biệt "chưa tới ngày thu" với "đã chạy xong mà chưa trả tiền".
   *
   * Danh sách này chứa cả đơn `reserved`/`confirmed` (xe chưa ra khỏi bãi, còn nợ là bình
   * thường) lẫn `completed`/`no_show` (nợ thật, phải đi đòi). Thiếu cột này người thu nhìn
   * một bảng toàn số tiền giống nhau và không biết dòng nào cần gọi khách.
   */
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;

  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({
    description: 'PHẢI THU = tiền thuê + phụ phí còn hiệu lực. Tiền dạng string — ADR 0007',
  })
  totalAmount!: string;
  @ApiProperty({ description: 'ĐÃ THU = tiền thuê + phiếu tay đã duyệt + phần phụ phí cọc gánh' })
  paidAmount!: string;
  /** Phụ phí còn hiệu lực — đã nằm TRONG `totalAmount`, tách ra để giải thích con số. */
  @ApiProperty() surchargeTotal!: string;
  @ApiProperty({ description: 'max(0, phải thu − đã thu) — common/booking-money.ts' })
  debtAmount!: string;
}

export class DebtPageDto {
  @ApiProperty({ type: [DebtItemDto] }) data!: DebtItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class FinanceSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Từ ngày (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class FinanceSummaryDto {
  @ApiProperty({ description: 'Tổng thu (phiếu income đã duyệt), string' }) totalIncome!: string;
  @ApiProperty({ description: 'Tổng chi (phiếu expense đã duyệt), string' }) totalExpense!: string;
  @ApiProperty({ description: 'Cân đối = thu − chi, string' }) balance!: string;
  @ApiProperty({ description: 'Tổng công nợ các đơn còn nợ, string' }) totalDebt!: string;
  @ApiProperty({ description: 'Số đơn còn nợ' }) debtBookings!: number;
}

/**
 * Tổng thu/chi của ĐÚNG bộ lọc đang xem trên `/manage/receipts`.
 *
 * Khác `FinanceSummaryDto` (dashboard, chỉ theo khoảng ngày): thẻ tổng nằm ngay trên một danh
 * sách đã lọc thì phải cộng đúng những dòng đó — một thẻ "Tổng thu" không khớp bảng bên dưới là
 * cách nhanh nhất khiến người dùng thôi tin cả hai con số.
 */
export class ReceiptSummaryDto {
  @ApiProperty({ description: 'Tổng thu (phiếu đã duyệt trong bộ lọc), string' })
  totalIncome!: string;
  @ApiProperty({ description: 'Tổng chi (phiếu đã duyệt trong bộ lọc), string' })
  totalExpense!: string;
  @ApiProperty({ description: 'Cân đối = thu − chi, string' }) balance!: string;
  @ApiProperty({ description: 'Thu bằng tiền mặt, string' }) incomeCash!: string;
  @ApiProperty({ description: 'Thu bằng chuyển khoản/QR/thẻ, string' }) incomeTransfer!: string;
  @ApiProperty({ description: 'Số phiếu đã duyệt được cộng vào các số trên' })
  approvedCount!: number;
}

export class ReceiptBookingOptionQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã đơn / tên khách / SĐT / biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** Đủ để form tự điền khách, xe và số tiền còn nợ — không hơn. */
export class ReceiptBookingOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tenantCustomerId!: string | null;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) totalAmount!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty({ description: 'Còn nợ = max(0, tổng − đã trả)' }) debtAmount!: string;
}

export class ReceiptBookingOptionListDto {
  @ApiProperty({ type: [ReceiptBookingOptionDto] }) data!: ReceiptBookingOptionDto[];
}
