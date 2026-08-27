import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  MAINTENANCE_BOARD_FILTER_VALUES,
  MAINTENANCE_STATUS_VALUES,
  MAINTENANCE_TYPE_VALUES,
  ODOMETER_CORRECTION_REASON_VALUES,
  ODOMETER_MAX_KM,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Tiền nhập string thập phân ≤ 2 số lẻ (ADR 0007 — không dùng number). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** ULID 26 ký tự Crockford — id do SERVER phát, client chỉ nộp lại. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export { DEFAULT_LIMIT as MAINTENANCE_DEFAULT_LIMIT, MAX_LIMIT as MAINTENANCE_MAX_LIMIT };

// ── Odometer ────────────────────────────────────────────────────────────────

export class OdometerReadingDto {
  @ApiProperty() id!: string;
  @ApiProperty() odometerKm!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) previousKm!: number | null;
  @ApiProperty({ description: '@xeprime/types → OdometerSource' }) source!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) sourceRefId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reasonCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'Lần ghi này làm KM giảm' }) isDecrease!: boolean;
  @ApiProperty({ description: 'ISO' }) recordedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) recordedByName!: string | null;
}

export class OdometerHistoryDto {
  @ApiProperty({ type: [OdometerReadingDto] }) data!: OdometerReadingDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Chỉnh KM thủ công. Lý do là BẮT BUỘC (§9.1) — CHECK ở DB là chốt cuối.
 * Giảm KM còn phải có `vehicles.odometer.decrease` + `confirmDecrease` (xác nhận có ý thức).
 */
export class CorrectOdometerDto {
  @ApiProperty({ description: `KM mới, 0–${ODOMETER_MAX_KM}` })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  odometerKm!: number;

  @ApiProperty({ enum: ODOMETER_CORRECTION_REASON_VALUES })
  @IsIn(ODOMETER_CORRECTION_REASON_VALUES)
  reasonCode!: string;

  @ApiProperty({ description: 'Lý do chi tiết — bắt buộc, không được để trống' })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  /**
   * Người dùng đã thấy cảnh báo "KM mới thấp hơn KM hiện tại" và vẫn muốn tiếp tục.
   * Không có nó thì thao tác giảm bị từ chối kể cả khi đủ quyền — chống bấm nhầm.
   */
  @ApiPropertyOptional({ type: Boolean, description: 'Xác nhận giảm KM có chủ ý' })
  @IsOptional()
  @IsBoolean()
  confirmDecrease?: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bắt buộc — chống sửa đè' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion?: number | null;
}

// ── Hồ sơ bảo dưỡng ─────────────────────────────────────────────────────────

export class MaintenanceProfileDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = chưa có số, KHÔNG phải 0' })
  currentOdometerKm!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) currentOdometerSource!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  currentOdometerAt!: string | null;
  /** Mô tả nguồn cập nhật gần nhất, vd "Đơn #T2408-001" — để header nói được KM từ đâu. */
  @ApiPropertyOptional({ type: String, nullable: true }) currentOdometerRefLabel!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) oilChangeIntervalKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) lastServiceKm!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  lastServiceAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;

  // Các số SUY RA — server tính để FE/BE không lệch công thức (§9).
  @ApiPropertyOptional({ type: Number, nullable: true }) nextMaintenanceKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) remainingKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) usedKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) usedPercent!: number | null;
  @ApiProperty({ description: '@xeprime/types → MaintenanceDueStatus' }) dueStatus!: string;
  /** Ngưỡng "sắp đến hạn" đang hiệu lực (KM) — trả về để UI không tự đoán con số. */
  @ApiProperty() dueSoonKm!: number;

  @ApiProperty({ description: 'Optimistic concurrency — nộp lại khi lưu' }) rowVersion!: number;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

export class SaveMaintenanceProfileDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Chu kỳ thay nhớt (KM)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  oilChangeIntervalKm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'KM lần thay nhớt gần nhất' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  lastServiceKm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'lastServiceAt phải dạng YYYY-MM-DD' })
  lastServiceAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bắt buộc — chống sửa đè' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion?: number | null;
}

// ── Phiếu bảo dưỡng ─────────────────────────────────────────────────────────

export class MaintenanceAttachmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mimeType!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) size!: number | null;
}

export class MaintenanceRecordDto {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ enum: MAINTENANCE_TYPE_VALUES }) type!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customTypeName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ enum: MAINTENANCE_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  plannedStartAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  plannedEndAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  completedAt!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) odometerKm!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerName!: string | null;
  /**
   * Tiền dạng string (ADR 0007). `undefined` (vắng mặt) = người gọi KHÔNG có
   * `vehicles.maintenance.view_cost` — khác hẳn `null` = phiếu chưa nhập chi phí.
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền string — ADR 0007' })
  cost?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) receiptCode?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  /** Vắng mặt khi thiếu `vehicles.maintenance.view_files` — tên file là metadata riêng tư. */
  @ApiPropertyOptional({ type: [MaintenanceAttachmentDto] })
  attachments?: MaintenanceAttachmentDto[];
  @ApiProperty() attachmentCount!: number;
  @ApiProperty({ description: 'Optimistic concurrency' }) rowVersion!: number;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

export class MaintenanceRecordListDto {
  @ApiProperty({ type: [MaintenanceRecordDto] }) data!: MaintenanceRecordDto[];
}

export class SaveMaintenanceRecordDto {
  @ApiProperty({ enum: MAINTENANCE_TYPE_VALUES })
  @IsIn(MAINTENANCE_TYPE_VALUES)
  type!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ cho loại `other`' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customTypeName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — mốc bắt đầu dự kiến' })
  @IsOptional()
  @IsISO8601()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — mốc kết thúc dự kiến' })
  @IsOptional()
  @IsISO8601()
  plannedEndAt?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  odometerKm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền string — ADR 0007' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'cost phải là số tiền hợp lệ' })
  cost?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** Danh sách file riêng tư ĐÃ xác minh cần đính — server kiểm sở hữu trước khi gắn. */
  @ApiPropertyOptional({ type: [String], description: 'ID file riêng tư (ULID)' })
  @IsOptional()
  @Matches(ULID_PATTERN, { each: true })
  attachmentFileIds?: string[];

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bắt buộc khi sửa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion?: number | null;
}

/** Hoàn tất phiếu — có thể đẩy KM hiện tại và mốc thay nhớt (đúng loại) trong cùng transaction. */
export class CompleteMaintenanceDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — mặc định là bây giờ' })
  @IsOptional()
  @IsISO8601()
  completedAt?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'KM lúc bảo dưỡng — bỏ trống nếu ghi nhận hồi tố',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  odometerKm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền string — ADR 0007' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'cost phải là số tiền hợp lệ' })
  cost?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiProperty({ description: 'Bắt buộc — chống sửa đè' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}

export class PresignMaintenanceFileDto {
  @ApiProperty({ description: 'Tên file gốc (chỉ để hiển thị)' })
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

// ── Trung tâm bảo dưỡng (toàn đội xe) ───────────────────────────────────────

/**
 * Một dòng của Trung tâm bảo dưỡng — gộp tình trạng KM của xe và phiếu liên quan gần nhất.
 * Dòng là XE (không phải phiếu): câu hỏi của người vận hành là "xe nào cần đụng tới".
 */
export class MaintenanceBoardItemDto {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty() vehicleCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ description: '@xeprime/types → VehicleOperationStatus' })
  operationStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true }) currentOdometerKm!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  currentOdometerAt!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) oilChangeIntervalKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) nextMaintenanceKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) remainingKm!: number | null;
  @ApiProperty({ description: '@xeprime/types → MaintenanceDueStatus' }) dueStatus!: string;
  @ApiProperty() dueSoonKm!: number;

  /** Phiếu đang mở gần nhất (đang bảo dưỡng hoặc đã lên lịch) — null nếu không có. */
  @ApiPropertyOptional({ type: MaintenanceRecordDto, nullable: true })
  activeRecord!: MaintenanceRecordDto | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — hoàn tất gần nhất' })
  lastCompletedAt!: string | null;
  /** Số giấy tờ đã/sắp hết hạn — CẢNH BÁO liên quan, KHÔNG phải phiếu bảo dưỡng (§9.2). */
  @ApiProperty() expiringDocumentCount!: number;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

export class MaintenanceBoardListDto {
  @ApiProperty({ type: [MaintenanceBoardItemDto] }) data!: MaintenanceBoardItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Đếm theo từng nhóm việc — dải tab đầu trang, không phụ thuộc trang hiện tại. */
export class MaintenanceBoardSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() dueSoon!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() missingOdometer!: number;
  @ApiProperty() upcoming!: number;
  @ApiProperty({ description: 'Xe có giấy tờ sắp/đã hết hạn — cảnh báo liên quan' })
  expiringDocuments!: number;
  /**
   * Biên bản trả xe đã chốt nhưng chưa có KM (Wave 8). Đếm theo BIÊN BẢN, không theo xe —
   * một xe có thể tồn đọng nhiều chuyến, và mỗi chuyến là một việc phải xử lý riêng.
   */
  @ApiProperty({ description: 'Việc "Thiếu KM trả" đang tồn đọng' })
  missingReturnKm!: number;
}

export class MaintenanceBoardQueryDto {
  @ApiPropertyOptional({ enum: MAINTENANCE_BOARD_FILTER_VALUES })
  @IsOptional()
  @IsIn(MAINTENANCE_BOARD_FILTER_VALUES)
  filter?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên xe, mã xe hoặc biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: MAINTENANCE_TYPE_VALUES, description: 'Loại của phiếu liên quan' })
  @IsOptional()
  @IsIn(MAINTENANCE_TYPE_VALUES)
  type?: string;

  @ApiPropertyOptional({ description: 'ISO — lịch từ ngày' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO — lịch đến ngày' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description: 'remaining_asc | remaining_desc | name_asc | updated_desc',
  })
  @IsOptional()
  @IsIn(['remaining_asc', 'remaining_desc', 'name_asc', 'updated_desc'])
  sort?: 'remaining_asc' | 'remaining_desc' | 'name_asc' | 'updated_desc';

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/**
 * Sửa CHI PHÍ của phiếu bảo dưỡng đã hoàn tất (epic nối tiền).
 *
 * Cố ý hẹp: chỉ tiền + mã chứng từ. Lý do BẮT BUỘC vì con số này đã nằm trong sổ Thu-Chi — sửa
 * tiền mà không nói vì sao là xoá dấu vết, đúng thứ `audit_logs` sinh ra để chống.
 */
export class CorrectMaintenanceCostDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tiền string — ADR 0007. `null` = xoá chi phí (phiếu chi bị huỷ theo)',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'cost phải là số tiền hợp lệ' })
  cost?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptCode?: string | null;

  @ApiProperty({ description: 'Vì sao sửa — vào audit cùng giá trị cũ' })
  @IsString()
  @Length(3, 500)
  correctionReason!: string;

  @ApiProperty({ description: 'rowVersion đang thấy — chống ghi đè' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}
