import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  VEHICLE_DOCUMENT_OCR_FIELD_VALUES,
  VEHICLE_DOCUMENT_OCR_STATUS_VALUES,
  VEHICLE_DOCUMENT_TYPE_VALUES,
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
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCalendarDate } from '../../../../common/calendar-date';

/** ULID 26 ký tự Crockford — id do SERVER phát, client chỉ nộp lại. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Metadata AN TOÀN của file giấy tờ — không URL, không object key (kỷ luật Wave 4.1). */
export class VehicleDocumentFileDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mimeType!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) size!: number | null;
}

export class VehicleDocumentVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: VehicleDocumentFileDto }) file!: VehicleDocumentFileDto;
  @ApiProperty({ description: 'ISO' }) uploadedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — đã bị thay thế lúc' })
  archivedAt!: string | null;
}

export class VehicleDocumentOcrFieldDto {
  @ApiProperty({ enum: VEHICLE_DOCUMENT_OCR_FIELD_VALUES }) field!: string;
  @ApiProperty({ description: 'Giá trị nhận dạng (đã chuẩn hoá)' }) value!: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Độ tin cậy 0–100' })
  confidence!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Bằng chứng nguồn' })
  evidence!: string | null;
}

/** Chỉ trả từ các endpoint OCR (quyền manage) — KHÔNG bao giờ nằm trong summary/detail (Wave 5.1). */
export class VehicleDocumentOcrJobDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VEHICLE_DOCUMENT_OCR_STATUS_VALUES }) status!: string;
  @ApiProperty() provider!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) confidence!: number | null;
  @ApiProperty({ type: [VehicleDocumentOcrFieldDto] }) fields!: VehicleDocumentOcrFieldDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) completedAt!: string | null;
}

/**
 * Bản TÓM TẮT cho `vehicles.documents.view` (Wave 5.1) — chỉ đủ để hiển thị TRẠNG THÁI
 * giấy tờ. Tuyệt đối không mang PII (tên/địa chỉ chủ xe, số giấy tờ, số khung/máy),
 * không tên file, không dữ liệu OCR.
 */
export class VehicleDocumentSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VEHICLE_DOCUMENT_TYPE_VALUES }) type!: string;
  /** Nhãn hiển thị cho loại `other` — nhãn do shop tự đặt, không phải PII. */
  @ApiPropertyOptional({ type: String, nullable: true }) customTypeName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'YYYY-MM-DD — null = không thời hạn; cần cho cảnh báo hết hạn',
  })
  expiresAt!: string | null;
  /**
   * Trạng thái trình bày SUY RA lúc đọc (Chưa có/Đang xử lý/Cần kiểm tra/Còn hiệu lực/
   * Sắp hết hạn/Đã hết hạn/Không đọc được) — không cột nào lưu nó. Hết hạn CHỈ cảnh báo.
   */
  @ApiProperty() presentation!: string;
  /**
   * Ngưỡng "sắp hết hạn" hiệu lực (ngày) — từ cấu hình tenant; null = sản phẩm chưa chốt,
   * chỉ suy được còn hạn/hết hạn (docs/design/12 §8: không hard-code 30).
   */
  @ApiPropertyOptional({ type: Number, nullable: true }) warningDays!: number | null;
  @ApiProperty({ description: 'Giấy tờ đã có file đính kèm chưa' }) hasFile!: boolean;
  /**
   * Id phiên bản đang dùng — cần cho nút "Xem file" (endpoint download tự kiểm quyền
   * `view_files`); là ULID mờ, không phải metadata nhạy cảm.
   */
  @ApiPropertyOptional({ type: String, nullable: true }) activeVersionId!: string | null;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

/**
 * Bản CHI TIẾT cho `vehicles.documents.view_details` — metadata nhạy cảm của giấy tờ.
 * KHÔNG kèm lịch sử phiên bản (quyền `view_files`) và KHÔNG kèm dữ liệu OCR (quyền manage).
 */
export class VehicleDocumentDetailDto extends VehicleDocumentSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true }) documentNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) holderName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) holderAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) chassisNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) engineNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  issuedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ description: 'Optimistic concurrency — nộp lại khi update' })
  rowVersion!: number;
  @ApiPropertyOptional({ type: VehicleDocumentVersionDto, nullable: true })
  activeVersion!: VehicleDocumentVersionDto | null;
}

export class VehicleDocumentListDto {
  @ApiProperty({ type: [VehicleDocumentSummaryDto] }) data!: VehicleDocumentSummaryDto[];
}

/** Lịch sử phiên bản — endpoint riêng sau quyền `view_files` (tên file là metadata file riêng tư). */
export class VehicleDocumentVersionListDto {
  @ApiProperty({ type: [VehicleDocumentVersionDto] }) data!: VehicleDocumentVersionDto[];
}

/**
 * Tạo/sửa metadata giấy tờ. Update PHẢI nộp `expectedRowVersion` — lệch với DB là 409
 * (người khác vừa sửa), không âm thầm ghi đè. Decorator ở đây là lớp chặn thô; luật
 * đầy đủ (trạng thái gộp, ký tự điều khiển) nằm ở `document-metadata.ts` phía service.
 */
export class SaveVehicleDocumentDto {
  @ApiProperty({ enum: VEHICLE_DOCUMENT_TYPE_VALUES })
  @IsIn(VEHICLE_DOCUMENT_TYPE_VALUES)
  type!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ cho loại `other`' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customTypeName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  holderName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  holderAddress?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plateNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  chassisNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  engineNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsCalendarDate()
  issuedAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsCalendarDate()
  expiresAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bắt buộc khi update' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion?: number | null;
}

export class PresignVehicleDocumentDto {
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

/** Gắn file ĐÃ hoàn tất xác minh thành phiên bản mới của giấy tờ. */
export class AttachDocumentVersionDto {
  @ApiProperty({ description: 'ID file riêng tư do server phát (ULID)' })
  @Matches(ULID_PATTERN)
  fileId!: string;
}

/**
 * Áp kết quả OCR: client chỉ chọn TÊN TRƯỜNG — giá trị lấy từ job trên server,
 * client không nộp giá trị được (chống bịa giá trị "nhận dạng").
 * `fields` rỗng = đánh dấu đã đối soát mà không áp gì (Bỏ qua).
 */
export class ApplyOcrFieldsDto {
  @ApiProperty({ type: [String], enum: VEHICLE_DOCUMENT_OCR_FIELD_VALUES })
  @IsArray()
  @ArrayMaxSize(VEHICLE_DOCUMENT_OCR_FIELD_VALUES.length)
  @IsIn(VEHICLE_DOCUMENT_OCR_FIELD_VALUES, { each: true })
  fields!: string[];

  /** Đồng thời cập nhật BIỂN SỐ vào hồ sơ xe (đi qua luật sửa nhạy cảm/duyệt lại). */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  applyPlateToVehicle?: boolean;
}
