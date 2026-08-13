import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FUEL_LEVEL_VALUES,
  HANDOVER_PHOTO_SLOT_VALUES,
  HANDOVER_STATUS_VALUES,
  HANDOVER_TYPE_VALUES,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME_TYPES,
  ODOMETER_CORRECTION_REASON_VALUES,
  ODOMETER_MAX_KM,
} from '@xeprime/types';
import { Type } from 'class-transformer';
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
import { PaginationMetaDto } from '../../../../common/dto/api-response.dto';

// ── Ảnh hiện trạng ──────────────────────────────────────────────────────────

/**
 * Một ô ảnh của biên bản.
 *
 * `fileId`/`name` CHỈ có mặt khi người gọi có `handovers.view_files`. Vắng mặt khác hẳn
 * `null`: người vận hành thấy được "góc trước đã có ảnh" để biết còn thiếu gì, nhưng không
 * cầm được định danh file để đi mở bằng chứng của mọi chuyến cũ.
 */
export class HandoverPhotoDto {
  @ApiProperty({ enum: HANDOVER_PHOTO_SLOT_VALUES }) slot!: string;
  @ApiProperty({ description: 'ISO' }) uploadedAt!: string;
  @ApiPropertyOptional({ type: String, description: 'Chỉ khi có handovers.view_files' })
  fileId?: string;
  @ApiPropertyOptional({ type: String, description: 'Chỉ khi có handovers.view_files' })
  name?: string;
}

// ── Biên bản ────────────────────────────────────────────────────────────────

export class HandoverDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ enum: HANDOVER_TYPE_VALUES }) type!: string;
  @ApiProperty({ enum: HANDOVER_STATUS_VALUES }) status!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'null = chưa nhập, KHÔNG phải 0 km',
  })
  odometerKm!: number | null;
  /** Đã xác nhận nhưng không có KM → task "Thiếu KM trả" đang chờ người đủ quyền bổ sung. */
  @ApiProperty() odometerMissing!: boolean;
  @ApiProperty({ description: 'Người vận hành đã xác nhận KM bất thường là đúng' })
  suspiciousAcknowledged!: boolean;

  @ApiProperty({ description: '@xeprime/types → HandoverEnergyKind (suy từ nhiên liệu xe)' })
  energyKind!: string;
  @ApiPropertyOptional({ type: String, nullable: true, enum: FUEL_LEVEL_VALUES })
  fuelLevel!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) batteryPercent!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true }) conditionNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) damageNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;

  @ApiProperty({ type: [HandoverPhotoDto] }) photos!: HandoverPhotoDto[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  confirmedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) confirmedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  canceledAt!: string | null;

  @ApiProperty({ description: 'Optimistic concurrency — nộp lại khi lưu/xác nhận' })
  rowVersion!: number;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

/** Cảnh báo KM bất thường — chỉ tính khi gian hàng đã cấu hình ngưỡng. */
export class HandoverSuspicionDto {
  @ApiProperty() suspicious!: boolean;
  @ApiProperty() expectedMinKm!: number;
  @ApiProperty() deltaKm!: number;
  @ApiProperty() rentalDays!: number;
  @ApiProperty() thresholdKmPerDay!: number;
}

/**
 * Toàn bộ ngữ cảnh bàn giao của MỘT đơn — một lần gọi đủ dựng cả tấm màn hình.
 *
 * Các số suy ra (mốc KM phải vượt, hao hụt nhiên liệu, ngưỡng nghi ngờ) do SERVER tính và
 * trả về, để UI không tự đoán và hai phía không lệch công thức.
 */
export class HandoverContextDto {
  @ApiProperty() bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty({ description: '@xeprime/types → BookingStatus' }) bookingStatus!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ description: '@xeprime/types → HandoverEnergyKind' }) energyKind!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'KM hiện tại của xe theo hệ thống — null = chưa từng ghi nhận',
  })
  vehicleOdometerKm!: number | null;
  /** KM chốt ở biên bản giao xe đã xác nhận — mốc sàn mà KM trả phải vượt qua. */
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupOdometerKm!: number | null;
  /**
   * Mốc bảo dưỡng tiếp theo của xe (`lastServiceKm + intervalKm`) — để màn xác nhận nói được
   * hệ quả thật của con số sắp ghi. `null` = chưa đủ dữ liệu, UI hiển thị `Chưa đủ dữ liệu`
   * chứ KHÔNG dựng số giả.
   */
  @ApiPropertyOptional({ type: Number, nullable: true }) nextMaintenanceKm!: number | null;
  @ApiProperty({ description: 'Số ngày thuê theo đơn (làm tròn lên, tối thiểu 1)' })
  rentalDays!: number;
  /**
   * Ngưỡng KM/ngày để cảnh báo bất thường. `null` = gian hàng CHƯA cấu hình → không kiểm,
   * và UI nói rõ là chưa cấu hình chứ không bịa một con số.
   */
  @ApiPropertyOptional({ type: Number, nullable: true }) suspiciousKmPerDay!: number | null;

  @ApiPropertyOptional({ type: HandoverDto, nullable: true }) pickup!: HandoverDto | null;
  @ApiPropertyOptional({ type: HandoverDto, nullable: true }) return!: HandoverDto | null;

  /** Đơn có đang ở trạng thái mở được từng chiều bàn giao không (backend là nơi chốt). */
  @ApiProperty() canStartPickup!: boolean;
  @ApiProperty() canStartReturn!: boolean;
}

// ── Hàng đợi "Thiếu KM trả" toàn gian hàng (Wave 8) ─────────────────────────

/**
 * Một việc trong hàng đợi. Chỉ mang thứ cần để NHẬN RA việc và đi tới chỗ xử lý — không ảnh,
 * không tên file, không ghi chú hiện trạng (những thứ đó nằm sau `handovers.view_files` và
 * biên bản của chính đơn).
 */
export class MissingOdometerItemDto {
  @ApiProperty() handoverId!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ description: 'ISO — thời điểm biên bản được xác nhận' })
  confirmedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) confirmedByName!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'KM chốt lúc giao xe — mốc sàn khi bổ sung. null = biên bản giao cũng chưa có số',
  })
  pickupOdometerKm!: number | null;
  @ApiProperty({ description: 'Optimistic concurrency — nộp lại khi bổ sung KM' })
  rowVersion!: number;
}

export class MissingOdometerQueueDto {
  @ApiProperty({ type: [MissingOdometerItemDto] }) data!: MissingOdometerItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class MissingOdometerQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên xe, biển số hoặc mã đơn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ── Đầu vào ─────────────────────────────────────────────────────────────────

/**
 * Lưu bản nháp. Mọi trường đều tuỳ chọn: nhân viên nhập dở rồi quay lại là luồng bình thường
 * ở quầy. `undefined` = không đụng tới, `null` = xoá giá trị — không nhập nhằng.
 */
export class SaveHandoverDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: `KM đọc trên đồng hồ, 0–${ODOMETER_MAX_KM}` })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  odometerKm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: FUEL_LEVEL_VALUES })
  @IsOptional()
  @IsIn([...FUEL_LEVEL_VALUES, null])
  fuelLevel?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '% pin xe điện (0–100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conditionNote?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ có nghĩa ở chiều trả' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  damageNote?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** Đánh dấu "đã nhập đủ, chờ người có quyền xác nhận" — không phải xác nhận. */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  markReady?: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bắt buộc khi sửa bản đã có' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion?: number | null;
}

/**
 * Xác nhận — thao tác duy nhất có hệ quả thật.
 *
 * Hai cờ xác nhận có ý thức, mặc định TẮT: không bao giờ âm thầm bỏ qua cảnh báo hay âm thầm
 * đóng đơn mà thiếu số KM.
 *
 * KHÔNG có trường thời điểm xác nhận: mốc đó do server sinh lúc giành được biên bản. Pipe
 * toàn cục chạy `forbidNonWhitelisted`, nên client cố gửi `confirmedAt` sẽ bị 400 chứ không
 * bị bỏ qua im lặng — lùi ngày biên bản phải là một luồng riêng có phê duyệt, không phải một
 * trường lọt vào body.
 */
export class ConfirmHandoverDto {
  @ApiProperty({ description: 'Bắt buộc — chống hai người cùng xác nhận trên hai bản khác nhau' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;

  /** Đã xem cảnh báo KM bất thường và khẳng định số đọc là đúng. */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  acknowledgeSuspicious?: boolean;

  /**
   * Chấp nhận đóng biên bản mà CHƯA có số KM — sinh task "Thiếu KM trả". KM có thẩm quyền của
   * xe KHÔNG bị đụng tới (§9.1: "Thiếu KM trả: không tăng KM tự động").
   *
   * CHỈ có tác dụng ở chiều TRẢ xe. Biên bản giao xe thiếu KM luôn bị từ chối.
   */
  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ dùng cho chiều trả xe' })
  @IsOptional()
  @IsBoolean()
  allowMissingOdometer?: boolean;
}

export class CancelHandoverDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}

export class PresignHandoverPhotoDto {
  @ApiProperty({ description: 'Tên file gốc (chỉ để hiển thị)' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ enum: IMAGE_UPLOAD_MIME_TYPES, description: 'Chỉ ảnh — không nhận PDF' })
  @IsIn(IMAGE_UPLOAD_MIME_TYPES)
  contentType!: string;

  @ApiProperty({ description: `Dung lượng (byte), tối đa ${IMAGE_UPLOAD_MAX_BYTES}` })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMAGE_UPLOAD_MAX_BYTES)
  fileSize!: number;

  @ApiProperty({ enum: HANDOVER_PHOTO_SLOT_VALUES })
  @IsIn(HANDOVER_PHOTO_SLOT_VALUES)
  slot!: string;
}

export class AttachHandoverPhotoDto {
  @ApiProperty({ description: 'ID file đã presign (ULID do server phát)' })
  @IsString()
  @MaxLength(26)
  fileId!: string;

  @ApiProperty({ enum: HANDOVER_PHOTO_SLOT_VALUES })
  @IsIn(HANDOVER_PHOTO_SLOT_VALUES)
  slot!: string;
}

/**
 * Bổ sung/sửa KM trên biên bản ĐÃ XÁC NHẬN — đường duy nhất chạm vào biên bản chỉ-đọc.
 * Lý do bắt buộc, giảm KM cần quyền cao hơn + xác nhận, mọi lần đều để lại audit.
 */
export class ResolveHandoverOdometerDto {
  @ApiProperty({ description: `KM đọc trên đồng hồ, 0–${ODOMETER_MAX_KM}` })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODOMETER_MAX_KM)
  odometerKm!: number;

  @ApiProperty({ enum: ODOMETER_CORRECTION_REASON_VALUES })
  @IsIn(ODOMETER_CORRECTION_REASON_VALUES)
  reasonCode!: string;

  @ApiProperty({ description: 'Lý do chi tiết — bắt buộc' })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Xác nhận giảm KM có chủ ý' })
  @IsOptional()
  @IsBoolean()
  confirmDecrease?: boolean;

  @ApiProperty({ description: 'Bắt buộc — chống sửa đè' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}
