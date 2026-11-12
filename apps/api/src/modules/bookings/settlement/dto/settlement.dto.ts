import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEPOSIT_STATUS_VALUES,
  ODOMETER_MAX_KM,
  REFUND_METHOD_VALUES,
  RETURN_SURCHARGE_DRAFT_MAX,
  SURCHARGE_CATEGORY_VALUES,
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Tiền vào ra dưới dạng chuỗi thập phân — ADR 0007, không bao giờ `number`. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

// ── Phát sinh ───────────────────────────────────────────────────────────────

export class BookingSurchargeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ description: 'Tiền dạng chuỗi - ADR 0007' }) amount!: string;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

export class SaveSurchargeDto {
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES, description: 'KHÔNG có danh mục nhiên liệu' })
  @IsIn(SURCHARGE_CATEGORY_VALUES)
  category!: string;

  @ApiProperty({ description: 'VND, không âm (chuỗi - ADR 0007)' })
  @Matches(MONEY_PATTERN, { message: 'Số tiền không hợp lệ (số VND không âm)' })
  amount!: string;

  @ApiProperty({ description: 'Lý do - bắt buộc, đây là khoản trừ vào tiền của khách' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

/** Gỡ một khoản đã ghi nhầm. Huỷ MỀM kèm lý do — không xoá dấu vết. */
export class VoidSurchargeDto {
  @ApiProperty({ description: 'Lý do gỡ - bắt buộc' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

// ── Gợi ý quá giờ ───────────────────────────────────────────────────────────

/**
 * Đề xuất phí quá giờ do SERVER tính từ chính sách hiệu lực + giờ trả thực tế.
 *
 * Chỉ là GỢI Ý: chủ xe sửa hoặc bỏ qua. Trình duyệt không bao giờ tự tính con số này — hai nơi
 * cùng tính một công thức tiền là cách chắc chắn nhất để chúng lệch nhau.
 */
export class OvertimeSuggestionDto {
  @ApiProperty({ description: 'Có đủ dữ liệu (chính sách + giờ trả thực tế) để đề xuất không' })
  available!: boolean;
  @ApiProperty({ description: 'Số phút trễ so với lịch (đã trừ thời gian miễn phí)' })
  lateMinutes!: number;
  @ApiProperty({ description: 'Số giờ tính phí sau khi làm tròn' }) chargedHours!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) feePerHour!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền đề xuất' })
  amount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Diễn giải công thức' })
  formula!: string | null;
}

/**
 * Đề xuất phí VƯỢT KM của chuyến tự lái (09/09/2026).
 *
 * Chỉ là ĐỀ XUẤT: chủ xe bấm ghi mới thành phụ phí thật. Hệ thống không tự trừ tiền khách vì
 * quãng đường thực tế còn phụ thuộc những thứ nó không biết (khách báo trước, chủ xe đồng ý cho
 * chạy thêm, đồng hồ km hỏng…).
 *
 * `available: false` khi thiếu bất kỳ dữ kiện nào — hạn mức, số km lúc giao hoặc lúc nhận lại.
 * Nói rõ là chưa đủ dữ liệu, KHÔNG dựng một số 0 trông như "không vượt".
 */
export class ExcessMileageSuggestionDto {
  @ApiProperty({ description: 'Có đủ dữ kiện (hạn mức + hai chỉ số đồng hồ) để đề xuất không' })
  available!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Km/ngày trong giá theo snapshot của đơn' })
  includedKmPerDay!: number | null;
  @ApiProperty({ description: 'Số ngày tính phí của chuyến' }) chargedDays!: number;
  @ApiProperty({ description: 'Hạn mức tổng = số ngày × km mỗi ngày' }) allowedKm!: number;
  /*
   * Hai chỉ số đồng hồ THÔ, kèm theo chứ không chỉ hiệu của chúng: chủ xe đối chiếu số trên
   * biên bản bàn giao với số ở đây trước khi trừ tiền khách. Null = biên bản chưa ghi chỉ số.
   */
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Đồng hồ km lúc GIAO xe' })
  pickupOdometerKm!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Đồng hồ km lúc NHẬN LẠI xe' })
  returnOdometerKm!: number | null;
  @ApiProperty({ description: 'Km thực tế đã chạy (đồng hồ trả − đồng hồ giao)' }) actualKm!: number;
  @ApiProperty({ description: 'Km vượt hạn mức (không âm)' }) excessKm!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) feePerKm!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền đề xuất' })
  amount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Diễn giải công thức' })
  formula!: string | null;
}

// ── Hoàn cọc ────────────────────────────────────────────────────────────────

export class DepositRefundDto {
  @ApiProperty({ description: 'Tiền dạng chuỗi' }) refundAmount!: string;
  @ApiProperty({ enum: REFUND_METHOD_VALUES }) refundMethod!: string;
  @ApiProperty({ description: 'ISO' }) refundedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) recordedByName!: string | null;
  @ApiProperty({ description: 'Optimistic concurrency - nộp lại khi điều chỉnh' })
  rowVersion!: number;
}

/**
 * Toàn cảnh quyết toán của MỘT đơn — một request đủ dựng thẻ cọc trên màn chi tiết.
 *
 * Mọi con số ở đây do server tính. `depositReceived` KHÔNG phải `bookings.deposit_amount`
 * (số cấu hình) mà là tổng khoản `payments.kind = 'deposit'` đã thu — không có bằng chứng đã
 * thu tiền thì không có việc hoàn tiền.
 */
/** Quy tắc phụ phí MẶC ĐỊNH đã đóng băng trên đơn (chuyến có tài xế) — để gợi ý khoản thật. */
export class SettlementSurchargeRuleDto {
  @ApiProperty({ description: 'DRIVER_SURCHARGE_KIND' }) kind!: string;
  @ApiProperty({ description: 'SURCHARGE_CATEGORY tương ứng khi ghi khoản thật' }) category!: string;
  @ApiProperty({ description: 'DRIVER_SURCHARGE_UNIT' }) unit!: string;
  @ApiProperty({ description: 'VND string - ADR 0007' }) amount!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) thresholdValue!: number | null;
}

export class BookingSettlementDto {
  @ApiProperty() bookingId!: string;
  @ApiProperty({ description: 'Cọc theo cấu hình đơn - CHƯA chắc đã thu' })
  depositRequired!: string;
  @ApiProperty({ description: 'Cọc ĐÃ THU (từ payments kind=deposit)' }) depositReceived!: string;
  @ApiProperty({ type: [BookingSurchargeDto] }) surcharges!: BookingSurchargeDto[];
  @ApiProperty({ description: 'Tổng phát sinh còn hiệu lực' }) surchargeTotal!: string;
  @ApiProperty({ description: 'max(cọc đã thu − tổng phát sinh, 0)' }) proposedRefund!: string;
  @ApiProperty({ description: 'max(tổng phát sinh − cọc đã thu, 0)' }) additionalDue!: string;
  @ApiProperty({ enum: DEPOSIT_STATUS_VALUES, description: '@xeprime/types → DepositStatus' })
  depositStatus!: string;
  @ApiPropertyOptional({ type: DepositRefundDto, nullable: true }) refund!: DepositRefundDto | null;
  @ApiProperty({ type: OvertimeSuggestionDto }) overtime!: OvertimeSuggestionDto;

  /**
   * Mức phụ phí đã công bố với khách LÚC ĐẶT (snapshot trên đơn, 08/09/2026) — gợi ý số tiền và
   * lý do khi ghi khoản thật; không tự cộng vào đơn. Rỗng với đơn tự lái/đơn cũ.
   */
  @ApiProperty({ type: [SettlementSurchargeRuleDto] })
  surchargeRules!: SettlementSurchargeRuleDto[];

  /** Đề xuất phí vượt km — chủ xe xác nhận mới thành khoản thật. */
  @ApiProperty({ type: ExcessMileageSuggestionDto })
  excessMileage!: ExcessMileageSuggestionDto;
}

export class RecordDepositRefundDto {
  @ApiProperty({ description: 'Số tiền thực hoàn (chuỗi - ADR 0007)' })
  @Matches(MONEY_PATTERN, { message: 'Số tiền không hợp lệ (số VND không âm)' })
  refundAmount!: string;

  @ApiProperty({ enum: REFUND_METHOD_VALUES })
  @IsIn(REFUND_METHOD_VALUES)
  refundMethod!: string;

  @ApiPropertyOptional({ description: 'ISO - mặc định hiện tại. Không được ở tương lai.' })
  @IsOptional()
  @IsDateString()
  refundedAt?: string;

  @ApiPropertyOptional({ description: 'Mã giao dịch/tham chiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Điều chỉnh một bản ghi hoàn cọc ĐÃ có — quyền cao hơn, lý do bắt buộc, audit before/after.
 * Nằm trong menu `⋯`, không phải một bước của mọi chuyến.
 */
export class CorrectDepositRefundDto extends RecordDepositRefundDto {
  @ApiProperty({ description: 'Lý do điều chỉnh - bắt buộc, vào audit' })
  @IsString()
  @MaxLength(1000)
  correctionReason!: string;

  @ApiProperty({ description: 'Bắt buộc - chống sửa đè' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}

// ── Nhận lại xe (06/11/2026) ────────────────────────────────────────────────

/**
 * Một khoản phát sinh NHÁP gõ trong hộp "Xác nhận đã nhận lại xe" (Figma `23941:65305`): để xem
 * trước tiền cọc / hoàn cọc, và để ghi CÙNG transaction với lượt xác nhận trả xe.
 *
 * Lý do tuỳ chọn ở đây (hộp chỉ có Loại + Số tiền): trống thì server lấy tên loại phụ phí — khách
 * vẫn đọc được một câu ở trang chuyến. Sửa câu chi tiết đi qua thẻ "Phát sinh" của trang đơn.
 */
export class ReturnSurchargeDraftDto {
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES })
  @IsIn(SURCHARGE_CATEGORY_VALUES)
  category!: string;

  @ApiProperty({ description: 'VND > 0 (chuỗi - ADR 0007)' })
  @Matches(MONEY_PATTERN, { message: 'Số tiền không hợp lệ (số VND không âm)' })
  amount!: string;

  @ApiPropertyOptional({ description: 'Lý do gửi khách. Trống ⇒ tên loại phụ phí' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/**
 * Những gì người nhận xe đang gõ trong hộp — server tính lại MỌI con số tiền từ đây (ADR 0007),
 * hộp chỉ hiển thị. Không ghi gì.
 */
export class PreviewReturnSettlementDto {
  @ApiPropertyOptional({
    description: 'ISO - giờ nhận lại xe đang chọn; dùng cho gợi ý quá giờ. Trống ⇒ bây giờ',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: `Odo lúc nhận lại đang nhập (0-${ODOMETER_MAX_KM}); dùng cho gợi ý vượt km`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  odometerKm?: number | null;

  @ApiPropertyOptional({ type: [ReturnSurchargeDraftDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RETURN_SURCHARGE_DRAFT_MAX)
  @ValidateNested({ each: true })
  @Type(() => ReturnSurchargeDraftDto)
  surcharges?: ReturnSurchargeDraftDto[];
}

/**
 * Quyết toán XEM TRƯỚC của lượt nhận lại xe — các khoản nháp đã cộng vào như thể đã ghi.
 *
 * `collectableAmount` là số khách còn phải đưa TẬN TAY gian hàng sau các khoản nháp: tiền thuê chưa
 * thu + phần phụ phí vượt cọc (`counterDueAmount` — công nợ trừ `D` đã ở XePrime). Ô "Đã thu tiền"
 * của hộp nộp lại ĐÚNG số này; lệch với số server tính lúc xác nhận ⇒ 409, không ghi gì.
 */
export class ReturnSettlementPreviewDto {
  @ApiProperty({ description: 'Cọc ĐÃ THU (payments kind=deposit)' }) depositReceived!: string;
  @ApiProperty({ description: 'Phát sinh đã ghi + các khoản nháp' }) surchargeTotal!: string;
  @ApiProperty({ description: 'max(cọc đã thu − tổng phát sinh, 0)' }) proposedRefund!: string;
  @ApiProperty({ description: 'max(tổng phát sinh − cọc đã thu, 0)' }) additionalDue!: string;
  @ApiProperty({ description: 'Số khách còn phải đưa gian hàng sau các khoản nháp' })
  collectableAmount!: string;
  @ApiProperty({ type: [BookingSurchargeDto], description: 'Các khoản ĐÃ ghi trước đó' })
  surcharges!: BookingSurchargeDto[];
  @ApiProperty({ type: OvertimeSuggestionDto, description: 'Theo giờ nhận lại đang chọn' })
  overtime!: OvertimeSuggestionDto;
  @ApiProperty({ type: ExcessMileageSuggestionDto, description: 'Theo Odo đang nhập' })
  excessMileage!: ExcessMileageSuggestionDto;
}
