import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCalendarDate } from '../../../common/calendar-date';

/** Tiền dạng chuỗi thập phân (ADR 0007) — cùng pattern với vehicle.dto. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** % dạng chuỗi 0–100, tối đa 2 số lẻ (hoa hồng, lãi suất). */
const PERCENT_PATTERN = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;
const MAX_CONTRACT_FILES = 10;
/** ULID 26 ký tự Crockford — id file riêng tư do SERVER phát, client chỉ nộp lại. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Trạng thái hiển thị của một tài liệu trong hồ sơ nguồn. */
export const SOURCE_CONTRACT_FILE_STATUS = ['ready', 'legacy'] as const;

/**
 * Metadata AN TOÀN của một tài liệu hợp đồng — KHÔNG có URL, KHÔNG có object key.
 * Tải về đi qua endpoint download có kiểm quyền (signed URL ngắn hạn phát lúc đó).
 * `id = null` + `status = 'legacy'` là bản ghi Wave 4 cũ (từng lưu URL public) — cần
 * tải lên lại để bảo đảm quyền riêng tư; API không bao giờ trả lại URL cũ.
 */
export class VehicleSourceContractFileDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ID file riêng tư (ULID)' })
  id!: string | null;

  @ApiProperty({ description: 'Tên file hiển thị' })
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  mimeType!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  size!: number | null;

  @ApiProperty({ enum: SOURCE_CONTRACT_FILE_STATUS })
  status!: string;
}

/** Xin presign upload hợp đồng — file id + object key do SERVER sinh, không nhận từ client. */
export class PresignSourceContractDto {
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

export class SourceContractPresignDto {
  @ApiProperty({ description: 'ID file riêng tư — dùng cho bước hoàn tất + đính vào hồ sơ' })
  fileId!: string;

  @ApiProperty({ description: 'URL PUT lên bucket riêng tư (hết hạn ngắn)' })
  uploadUrl!: string;

  @ApiProperty() expiresIn!: number;
}

export class SourceContractDownloadDto {
  @ApiProperty({ description: 'Signed GET URL ngắn hạn — không cache, không lưu' })
  downloadUrl!: string;

  @ApiProperty({ description: 'ISO — thời điểm URL hết hiệu lực' })
  expiresAt!: string;
}

/**
 * Lưu hồ sơ nguồn xe — MỘT DTO cho cả bốn biến thể, trường nào thuộc biến thể nào do
 * service kiểm chéo (gửi trường lạc biến thể là 400, để CHECK của DB không bao giờ phải nổ).
 * Mọi field biến thể đều optional ở tầng decorator; bắt buộc-theo-biến-thể nằm ở service.
 */
export class SaveVehicleSourceDto {
  @ApiProperty({ enum: VEHICLE_SOURCE_TYPE_VALUES })
  @IsIn(VEHICLE_SOURCE_TYPE_VALUES)
  sourceType!: string;

  // ── owned ──
  @ApiPropertyOptional({ description: 'Ngày mua xe (YYYY-MM-DD)', type: String, nullable: true })
  @IsOptional()
  @IsCalendarDate()
  purchaseDate?: string | null;

  @ApiPropertyOptional({ description: 'Giá trị xe khi mua (chuỗi thập phân VND)', type: String, nullable: true })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  purchasePrice?: string | null;

  @ApiPropertyOptional({ description: 'Nơi mua / đại lý bàn giao', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  purchasePlace?: string | null;

  // ── financed ──
  @ApiPropertyOptional({ description: 'Ngân hàng / tổ chức tín dụng', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bankName?: string | null;

  @ApiPropertyOptional({ description: 'Số hợp đồng tín dụng', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNumber?: string | null;

  @ApiPropertyOptional({ description: 'Dư nợ gốc ban đầu (chuỗi thập phân VND)', type: String, nullable: true })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  originalPrincipal?: string | null;

  @ApiPropertyOptional({ description: 'Gốc phải trả mỗi tháng (chuỗi thập phân VND)', type: String, nullable: true })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  monthlyPrincipal?: string | null;

  @ApiPropertyOptional({ description: 'Lãi phải trả mỗi tháng (chuỗi thập phân VND)', type: String, nullable: true })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  monthlyInterest?: string | null;

  @ApiPropertyOptional({ description: 'Lãi suất cố định %/năm (chuỗi 0–100)', type: String, nullable: true })
  @IsOptional()
  @Matches(PERCENT_PATTERN)
  interestRatePercent?: string | null;

  @ApiPropertyOptional({ description: 'Thời hạn vay (tháng)', type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  termMonths?: number | null;

  @ApiPropertyOptional({ enum: VEHICLE_FINANCE_INTEREST_METHOD_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_FINANCE_INTEREST_METHOD_VALUES)
  interestMethod?: string | null;

  // ── rented + partnership ──
  @ApiPropertyOptional({ description: 'Tên chủ xe / doanh nghiệp (bên cho thuê / đối tác)', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ownerName?: string | null;

  @ApiPropertyOptional({ description: 'Số điện thoại liên hệ của chủ xe', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ownerPhone?: string | null;

  @ApiPropertyOptional({ description: 'Email chủ xe (tuỳ chọn)', type: String, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  ownerEmail?: string | null;

  @ApiPropertyOptional({ description: 'Tiền thuê định kỳ hàng tháng (chuỗi thập phân VND)', type: String, nullable: true })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  monthlyRent?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      '% doanh thu chia cho CHỦ XE (0–100). Cơ sở: tiền thuê sau giảm giá; không gồm cọc/giao nhận/quá giờ/phạt/bồi thường.',
  })
  @IsOptional()
  @Matches(PERCENT_PATTERN)
  commissionPercent?: string | null;

  // ── chung ──
  @ApiPropertyOptional({ description: 'Ngày trong tháng đến hạn đóng tiền (1–31)', type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number | null;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu hợp đồng / giải ngân (YYYY-MM-DD)', type: String, nullable: true })
  @IsOptional()
  @IsCalendarDate()
  startDate?: string | null;

  @ApiPropertyOptional({ description: 'Ngày kết thúc hợp đồng (YYYY-MM-DD)', type: String, nullable: true })
  @IsOptional()
  @IsCalendarDate()
  endDate?: string | null;

  /**
   * ID các file riêng tư ĐÍNH vào hồ sơ — chỉ nhận id do server phát (ULID), tuyệt đối
   * không nhận URL/object key. Service kiểm từng id thuộc đúng tenant + xe + đã `ready`.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CONTRACT_FILES)
  @Matches(ULID_PATTERN, { each: true })
  contractFileIds?: string[];

  @ApiPropertyOptional({ description: 'Ghi chú thêm về nguồn gốc xe', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

/** Hồ sơ nguồn xe trả về — tiền/percent là CHUỖI, ngày là YYYY-MM-DD. */
export class VehicleSourceDetailDto {
  @ApiProperty({ enum: VEHICLE_SOURCE_TYPE_VALUES }) sourceType!: string;

  @ApiPropertyOptional({ type: String, nullable: true }) purchaseDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) purchasePrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) purchasePlace!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) bankName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contractNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) originalPrincipal!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) monthlyPrincipal!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) monthlyInterest!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tổng phải đóng mỗi tháng = gốc + lãi — TÍNH RA, không lưu',
  })
  monthlyTotal!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) interestRatePercent!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) termMonths!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) interestMethod!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) monthlyRent!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) commissionPercent!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true }) paymentDay!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) startDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endDate!: string | null;
  @ApiProperty({ type: [VehicleSourceContractFileDto] })
  contractFiles!: VehicleSourceContractFileDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  /**
   * Hồ sơ đã ĐỦ cho theo dõi nghĩa vụ tài chính chưa (Wave 4.1) — trạng thái tất định,
   * không chặn lưu dở dang; phase nghĩa vụ tài chính tiêu thụ cờ này.
   */
  @ApiProperty() obligationReady!: boolean;
  @ApiProperty({ description: 'ISO — lần cập nhật hồ sơ gần nhất' }) updatedAt!: string;
}

/**
 * Trạng thái tab Nguồn xe: `sourceType` hiện hành của xe (luôn có — chọn từ lúc tạo) +
 * hồ sơ chi tiết (`null` = chưa khai báo, FE hiện trạng thái trống kèm lối bổ sung).
 */
export class VehicleSourceDto {
  @ApiProperty({ enum: VEHICLE_SOURCE_TYPE_VALUES }) sourceType!: string;
  @ApiPropertyOptional({ type: VehicleSourceDetailDto, nullable: true })
  detail!: VehicleSourceDetailDto | null;
}
