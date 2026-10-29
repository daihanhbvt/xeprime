import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DRIVER_ASSIGNMENT_OUTCOME_VALUES,
  DRIVER_ASSIGNMENT_STATUS_VALUES,
  DRIVER_DROP_NOTE_LENGTH,
  DRIVER_DROP_REASON_VALUES,
  DRIVER_DROP_ZONE_VALUES,
  DRIVER_DROP_STATS_WINDOW_DAYS,
  DRIVER_INCIDENT_LEVEL_VALUES,
  type DriverDropReason,
  DRIVER_SOURCE_VALUES,
  DRIVER_LICENCE_STATE_VALUES,
  DRIVER_LINK_END_PARTY_VALUES,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_VALUES,
  DRIVER_TYPE_VALUES,
  STOREFRONT_KIND_VALUES,
  DRIVER_LINK_SCOPE_VALUES,
  type DriverLinkScope,
  type DriverSource,
  DRIVER_WAGE_REASON_MAX_LENGTH,
  DRIVER_WAGE_STAGE_VALUES,
  type DriverWageStage,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
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
  ValidateIf,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { IsMoneyStep } from '../../../common/validators/money-step.validator';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as DRIVER_DEFAULT_LIMIT, MAX_LIMIT as DRIVER_MAX_LIMIT };

const PHONE_PATTERN = /^(0|\+?84)\d{9}$/;
/** Tiền công: VND nguyên, tối đa 12 chữ số. */
const WAGE_PATTERN = /^\d{1,12}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// ─────────────────────────────────────────────────────────────────────────────
// Phía BÊN THUÊ (khu quản lý)
// ─────────────────────────────────────────────────────────────────────────────

export class DriverListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên / SĐT' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    enum: [...DRIVER_LINK_STATUS_VALUES, DRIVER_LINK_STATUS_FILTER_ANY],
    description:
      'Lọc trạng thái liên kết. Bỏ trống = các liên kết đang mở (chờ/đang/tạm khoá); `any` = mọi trạng thái.',
  })
  @IsOptional()
  @IsIn([...DRIVER_LINK_STATUS_VALUES, DRIVER_LINK_STATUS_FILTER_ANY])
  linkStatus?: string;

  @ApiPropertyOptional({ enum: DRIVER_TYPE_VALUES })
  @IsOptional()
  @IsIn(DRIVER_TYPE_VALUES)
  driverType?: string;

  @ApiPropertyOptional({
    description: 'Tháng YYYY-MM (giờ VN) cho hai cột thống kê tiền công — mặc định tháng hiện tại',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'Tháng phải có dạng YYYY-MM' })
  month?: string;

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

/** Mời một tài khoản KHÁCH làm tài xế — SĐT phải là tài khoản khách đã xác minh. */
export class InviteDriverDto {
  @ApiProperty({ example: '0901234567', description: 'SĐT tài khoản khách của tài xế' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiProperty({ example: 'Trần Văn B', description: 'Tên bên thuê gọi tài xế này' })
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiPropertyOptional({ enum: DRIVER_TYPE_VALUES, default: 'staff' })
  @IsOptional()
  @IsIn(DRIVER_TYPE_VALUES)
  driverType?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

/** Sửa phần bên thuê tự quản của liên kết. SĐT không sửa được — đổi người là mời lại. */
export class UpdateDriverDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ enum: DRIVER_TYPE_VALUES })
  @IsOptional()
  @IsIn(DRIVER_TYPE_VALUES)
  driverType?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class DriverAccountDto {
  @ApiProperty({ description: 'Tên hiển thị của tài khoản khách' }) displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
}

export class DriverLicenceSummaryDto {
  @ApiProperty({ enum: DRIVER_LICENCE_STATE_VALUES }) state!: string;
  @ApiProperty({ type: [String], description: 'Hạng trên bằng đã xác thực' })
  classes!: string[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  expiresOn!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Họ tên in trên bằng đã xác thực — để bên thuê đối chiếu với người được mời',
  })
  fullName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Loại bằng (DRIVER_LICENCE_KIND)',
  })
  kind!: string | null;
}

export class DriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'SĐT đã mời' }) phone!: string;
  @ApiProperty({ enum: DRIVER_TYPE_VALUES }) driverType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ enum: DRIVER_LINK_STATUS_VALUES }) linkStatus!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) invitedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) respondedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endedAt!: string | null;
  @ApiPropertyOptional({ enum: DRIVER_LINK_END_PARTY_VALUES, nullable: true })
  endedByParty!: string | null;
  @ApiProperty({ type: DriverAccountDto }) account!: DriverAccountDto;
  @ApiProperty({ type: DriverLicenceSummaryDto }) licence!: DriverLicenceSummaryDto;
  @ApiProperty({ description: 'Số chuyến chưa xong đang gán cho tài xế này' })
  activeBookingCount!: number;
  @ApiPropertyOptional({
    enum: DRIVER_LINK_STATUS_VALUES,
    nullable: true,
    description:
      'Chỉ ở dòng LỊCH SỬ (đã từ chối / đã kết thúc): trạng thái liên kết ĐANG MỞ hiện tại của cùng tài khoản với bên thuê này — null = chưa mời lại, hiện nút "Mời lại"',
  })
  currentOpenLinkStatus!: string | null;
  @ApiProperty({
    description: `Số lần tài xế RÚT chuyến đã nhận bị tính vi phạm trong ${DRIVER_DROP_STATS_WINDOW_DAYS} ngày (ADR 0074)`,
  })
  dropCount!: number;
  @ApiProperty({ description: 'Trong đó: số lần rút khi còn dưới 2 giờ tới giờ nhận' })
  criticalDropCount!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Đang bị loại khỏi tự gán "Đặt ngay" tới mốc này (ISO-8601) sau một lượt rút sát giờ — null = không',
  })
  autoAssignCooldownUntil!: string | null;
  @ApiProperty({
    description: 'Số chuyến tài xế HOÀN THÀNH, kết thúc trong tháng được chọn (ADR 0075)',
  })
  monthCompletedTrips!: number;
  @ApiProperty({
    type: String,
    description:
      'Tổng tiền công (VND) các lượt kết thúc trong tháng: chuyến hoàn thành + số thoả thuận của chuyến không chạy',
  })
  monthWageTotal!: string;
}

export class DriverPageDto {
  @ApiProperty({ type: [DriverDto] }) data!: DriverDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Tài xế đang phủ một đơn (ADR 0063 · ADR 0067) — liên kết HOẶC ghi tay ngoài hệ thống.
 *
 * Phía bên thuê (khu quản lý, Owner Lite): đủ trường. Phía KHÁCH của chính đơn: chỉ tên + SĐT
 * người sẽ đến đón — tài xế liên kết hiện khi đã NHẬN chuyến, `id` luôn null, không có hạn trả lời.
 */
export class BookingDriverSummaryDto {
  @ApiProperty({
    enum: DRIVER_SOURCE_VALUES,
    description:
      '`linked` = tài khoản khách đã liên kết (ADR 0063) · `external` = tên + SĐT bên thuê ghi trên đơn (ADR 0067)',
  })
  source!: DriverSource;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'ID liên kết tài xế (`drivers.id`) — null khi `source = external`, và luôn null ở bề mặt khách',
  })
  id!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Dạng hiển thị `0xxxxxxxxx`' }) phone!: string;
  @ApiProperty({
    enum: DRIVER_ASSIGNMENT_STATUS_VALUES,
    description: 'Tài xế ngoài hệ thống luôn `accepted` — không có lượt chờ',
  })
  assignmentStatus!: string;
  @ApiProperty({ description: 'ISO-8601 UTC — mốc gán (hoặc mốc ghi tài xế ngoài hệ thống)' })
  assignedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) respondedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Hạn tài xế trả lời (ISO-8601, ADR 0066) — chỉ khác null khi lượt đang chờ (pending). Quá hạn ⇒ hệ thống trả lượt về bên thuê.',
  })
  respondBy!: string | null;
}

/**
 * SỰ CỐ TÀI XẾ đang mở trên đơn, nhìn từ BÊN THUÊ (ADR 0074): một tài xế đã nhận rồi rút, chưa ai
 * nhận lại. `null` khi không có sự cố hoặc đã có tài xế nhận lại / đơn đã giao xe hay khép.
 */
export class BookingDriverIncidentDto {
  @ApiProperty({ description: 'ISO-8601 — lúc tài xế rút' }) droppedAt!: string;
  @ApiProperty({
    description: 'ISO-8601 — hạn bên thuê gán tài xế liên kết khác (SLA điều phối theo vùng)',
  })
  reassignBy!: string;
  @ApiProperty({ enum: DRIVER_INCIDENT_LEVEL_VALUES }) level!: string;
  @ApiProperty({
    description:
      'true = khách đang được huỷ hoàn 100% và lượt huỷ tính cho bên thuê (quá hạn điều phối hoặc còn dưới 2 giờ)',
  })
  customerCanCancelFree!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên tài xế đã rút — null khi sự cố đến từ lượt "trả lại" không lý do',
  })
  driverName!: string | null;
  @ApiPropertyOptional({ enum: DRIVER_DROP_REASON_VALUES, nullable: true })
  reasonCategory!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ enum: DRIVER_DROP_ZONE_VALUES, nullable: true }) zone!: string | null;
}

/** Sự cố tài xế nhìn từ KHÁCH (ADR 0074) — không bao giờ lộ ai đã rút. */
export class TripDriverIncidentDto {
  @ApiProperty({
    enum: DRIVER_INCIDENT_LEVEL_VALUES,
    description:
      '`arranging` "Đang sắp xếp tài xế" · `rearranging` "Đang điều phối lại" · `urgent` còn dưới 2 giờ — cảnh báo + hỗ trợ',
  })
  level!: string;
  @ApiProperty({
    description: 'true = khách huỷ ngay được hoàn 100% tiền giữ chỗ (lỗi phía cho thuê)',
  })
  freeCancel!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiền công tài xế (ADR 0075) — XePrime chỉ GHI NHẬN, chủ xe trả trực tiếp
// ─────────────────────────────────────────────────────────────────────────────

/** Một lần chủ xe sửa tiền công. */
export class DriverWageChangeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, description: 'VND' }) oldAmount!: string;
  @ApiProperty({ type: String, description: 'VND' }) newAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) changedAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Người sửa (thành viên bên thuê) — null khi tài khoản không còn',
  })
  changedByName!: string | null;
}

/** Khoảng tiền công hợp lệ của MỘT lượt gán (VND string). */
export class DriverWageRangeDto {
  @ApiProperty({ type: String }) min!: string;
  @ApiProperty({ type: String }) max!: string;
}

/**
 * Tiền công của một lượt gán — dùng cho CẢ bên thuê và chính tài xế (không có trường nào của
 * dòng tiền khách/chủ xe ở đây). `amount` null chỉ ở lượt gán trước tính năng.
 */
export class DriverWageDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND — số hiện hành' })
  amount!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Số ngày tính tiền lúc gán' })
  days!: number | null;
  @ApiProperty({
    enum: DRIVER_WAGE_STAGE_VALUES,
    description:
      '`offer` chờ nhận · `running` đã nhận · `completed` đã xong (mặc định đã trả) · `not_run` đã nhận nhưng không chạy · `not_applicable` chưa từng nhận',
  })
  stage!: DriverWageStage;
  @ApiProperty({ description: 'Bên thuê còn sửa được không (giai đoạn + hạn khoá)' })
  editable!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mốc khoá sửa (ISO-8601) = kết thúc lượt + 72h; null khi lượt chưa kết thúc',
  })
  editableUntil!: string | null;
  @ApiPropertyOptional({
    type: DriverWageRangeDto,
    nullable: true,
    description:
      'Khoảng hợp lệ khi sửa (chính sách hiện hành × số ngày) — null khi lượt không có tiền công',
  })
  range!: DriverWageRangeDto | null;
  @ApiProperty({ type: [DriverWageChangeDto], description: 'Lịch sử sửa, mới nhất trước' })
  changes!: DriverWageChangeDto[];
}

/** `GET /drivers/wage-settings` — mức mặc định của gian hàng + giới hạn nền tảng. */
export class DriverWageSettingsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tiền công/ngày mặc định (VND) — null = chưa đặt',
  })
  dailyWage!: string | null;
  @ApiProperty({ type: DriverWageRangeDto, description: 'Khoảng tiền công/ngày hợp lệ' })
  wageDaily!: DriverWageRangeDto;
  @ApiProperty({ type: DriverWageRangeDto, description: 'Khoảng giá có tài xế/ngày hợp lệ' })
  priceDaily!: DriverWageRangeDto;
  @ApiProperty({
    type: String,
    description: 'Tiền công/ngày GỢI Ý của nền tảng — chỉ để nhắc, không phải mức của gian hàng',
  })
  suggestedDaily!: string;
}

/**
 * `GET /bookings/:id/driver-wage-quote` — số liệu cho hộp gán tài xế của MỘT đơn: số ngày tính
 * tiền, tiền công gợi ý (mức mặc định × số ngày) và khoảng hợp lệ. Server tính, client chỉ đọc.
 */
export class DriverWageQuoteDto {
  @ApiProperty({ description: 'Số ngày tính tiền của đơn — mẫu số của tiền công' }) days!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tiền công/ngày mặc định của gian hàng — null = chưa đặt',
  })
  dailyWage!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Gợi ý = mức mặc định × số ngày — null khi chưa đặt mức mặc định',
  })
  suggestedAmount!: string | null;
  @ApiProperty({ type: DriverWageRangeDto, description: 'Khoảng hợp lệ khi gán chuyến này' })
  range!: DriverWageRangeDto;
  @ApiProperty({ type: DriverWageRangeDto, description: 'Khoảng tiền công/ngày hợp lệ' })
  wageDaily!: DriverWageRangeDto;
  @ApiProperty({
    type: String,
    description: 'Tiền công/ngày GỢI Ý của nền tảng — chỉ để nhắc khi gian hàng chưa đặt mức chung',
  })
  suggestedDaily!: string;
  @ApiProperty({ type: String, description: 'Tiền thuê của đơn (VND) — để cảnh báo tiền công cao bất thường' })
  rentAmount!: string;
}

/** `PATCH /drivers/wage-settings`. */
export class UpdateDriverWageSettingsDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Tiền công/ngày mặc định (VND, bội 1.000đ) — null = xoá mức mặc định',
  })
  @ValidateIf((o: UpdateDriverWageSettingsDto) => o.dailyWage !== null)
  @Matches(WAGE_PATTERN, { message: 'Tiền công không hợp lệ (số VND nguyên dương)' })
  @IsMoneyStep({ message: 'Tiền công phải là bội của 1.000đ' })
  dailyWage!: string | null;
}

/** `PATCH /bookings/:id/driver-assignments/:assignmentId/wage` — bên thuê sửa tiền công. */
export class UpdateDriverWageDto {
  @ApiProperty({ type: String, description: 'Tiền công mới của lượt gán (VND, bội 1.000đ)' })
  @Matches(WAGE_PATTERN, { message: 'Tiền công không hợp lệ (số VND nguyên không âm)' })
  @IsMoneyStep({ message: 'Tiền công phải là bội của 1.000đ' })
  amount!: string;

  @ApiPropertyOptional({ maxLength: DRIVER_WAGE_REASON_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(DRIVER_WAGE_REASON_MAX_LENGTH)
  reason?: string;
}

/** Truy vấn thống kê theo tháng (giờ Việt Nam). */
export class DriverWageMonthQueryDto {
  @ApiPropertyOptional({ description: 'Tháng YYYY-MM (giờ VN) — mặc định tháng hiện tại' })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'Tháng phải có dạng YYYY-MM' })
  month?: string;
}

/** `GET /drivers/:id/assignments` — các lượt tài xế đã nhận, kết thúc trong tháng. */
export class DriverAssignmentListQueryDto extends DriverWageMonthQueryDto {
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

export class DriverAssignmentRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'ID đơn' }) bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty() pickupAt!: string;
  @ApiProperty() returnAt!: string;
  @ApiProperty({ enum: DRIVER_ASSIGNMENT_OUTCOME_VALUES }) outcome!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) endedAt!: string | null;
  @ApiProperty({ enum: DRIVER_WAGE_STAGE_VALUES }) stage!: DriverWageStage;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND' })
  wageAmount!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) wageDays!: number | null;
}

export class DriverAssignmentPageDto {
  @ApiProperty({ type: [DriverAssignmentRowDto] }) data!: DriverAssignmentRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Một lượt gán trong lịch sử tài xế của đơn (khu quản lý, ADR 0063). */
export class BookingDriverHistoryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'ID liên kết tài xế' }) driverId!: string;
  @ApiProperty({ description: 'Tên bên thuê đặt cho tài xế' }) driverName!: string;
  @ApiProperty() driverPhone!: string;
  @ApiProperty({ enum: DRIVER_ASSIGNMENT_OUTCOME_VALUES }) outcome!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) assignedAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Người gán — null = hệ thống ("Đặt ngay" tự gán)',
  })
  assignedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) acceptedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Người kết thúc lượt (gỡ/từ chối) — null khi hệ thống khép theo trạng thái đơn',
  })
  endedByName!: string | null;
  @ApiPropertyOptional({
    enum: DRIVER_DROP_REASON_VALUES,
    nullable: true,
    description: 'Chỉ lượt `dropped` — nhóm lý do tài xế rút (ADR 0074)',
  })
  dropReasonCategory!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ghi chú của tài xế khi rút' })
  dropReason!: string | null;
  @ApiPropertyOptional({
    enum: DRIVER_DROP_ZONE_VALUES,
    nullable: true,
    description:
      'Chỉ lượt `dropped` — vùng theo độ sát giờ nhận; `grace` = trong cửa sổ trả lại, không phạt',
  })
  dropZone!: string | null;
  @ApiProperty({ type: DriverWageDto, description: 'Tiền công của lượt gán (ADR 0075)' })
  wage!: DriverWageDto;
}

export class AssignableDriversQueryDto {
  @ApiProperty({ description: 'Nhận xe của đơn (ISO-8601)' })
  @IsDateString()
  pickupAt!: string;

  @ApiProperty({ description: 'Trả xe của đơn (ISO-8601)' })
  @IsDateString()
  returnAt!: string;

  /** Bỏ qua chính đơn đang gán — đổi tài xế của đơn không tự coi đơn đó là "bận". */
  @ApiPropertyOptional({ description: 'ID đơn đang gán (ULID) — loại khỏi kiểm tra trùng' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  excludeBookingId?: string;
}

/**
 * Một tài xế trong bộ chọn gán đơn. Trả CẢ người bận kèm cờ — UI disable kèm nhãn "Bận" thay
 * vì giấu đi khiến người điều phối tưởng mình hết tài xế. KHÔNG nói bận việc gì, cho ai: lịch
 * của tài xế ở bên thuê khác không phải việc của bên này.
 */
export class AssignableDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ description: 'Có chuyến khác (ở bất kỳ bên thuê nào) giao khung giờ này' })
  busy!: boolean;
  @ApiProperty({ enum: DRIVER_LICENCE_STATE_VALUES }) licenceState!: string;
}

export class AssignableDriversDto {
  @ApiProperty({ type: [AssignableDriverDto] }) data!: AssignableDriverDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phía TÀI XẾ (tài khoản khách)
// ─────────────────────────────────────────────────────────────────────────────

/** Bên thuê nhìn từ phía tài xế — danh tính công khai (ADR 0054), không hơn. */
export class DriverEmployerDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({
    enum: STOREFRONT_KIND_VALUES,
    description: 'personal = chủ xe cá nhân, shop = gian hàng',
  })
  kind!: string;
}

/**
 * Liên hệ mở rộng của bên thuê — CHỈ cho tài xế có liên kết với bên đó (mở rộng ADR 0054 cho bề
 * mặt tài xế, chốt 26/10/2026). Không bao giờ vào DTO công khai.
 */
export class DriverEmployerContactDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Họ tên chủ tài khoản bên thuê' })
  representativeName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tỉnh/thành của gian hàng' })
  areaName!: string | null;
}

export class MyDriverLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: DriverEmployerDto }) employer!: DriverEmployerDto;
  @ApiProperty({ type: DriverEmployerContactDto }) employerContact!: DriverEmployerContactDto;
  @ApiProperty({ description: 'Số chuyến tôi đã hoàn thành cho bên này' })
  completedTripCount!: number;
  @ApiProperty({ enum: DRIVER_TYPE_VALUES }) driverType!: string;
  @ApiProperty({ enum: DRIVER_LINK_STATUS_VALUES }) linkStatus!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) invitedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) respondedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endedAt!: string | null;
  @ApiPropertyOptional({ enum: DRIVER_LINK_END_PARTY_VALUES, nullable: true })
  endedByParty!: string | null;
  @ApiProperty({ description: 'Số chuyến chưa xong đang gán cho tôi ở bên này' })
  activeTripCount!: number;
}

export class MyDriverLinkListQueryDto {
  @ApiPropertyOptional({
    enum: DRIVER_LINK_SCOPE_VALUES,
    description: 'open = lời mời + đang liên kết + tạm khoá; closed = đã kết thúc/từ chối',
  })
  @IsOptional()
  @IsIn(DRIVER_LINK_SCOPE_VALUES)
  scope?: DriverLinkScope;

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

export class MyDriverLinkPageDto {
  @ApiProperty({ type: [MyDriverLinkDto] }) data!: MyDriverLinkDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class DriverTripListQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past'], default: 'upcoming' })
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  tab?: 'upcoming' | 'past';

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

export class DriverTripVehicleDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
}

/**
 * Khách của chuyến nhìn từ phía tài xế — tên + SĐT hiện ngay từ lúc được gán, để tài xế gọi xác
 * nhận trước khi nhận chuyến. `contactVisibleFrom` giữ cho app cũ, luôn null.
 */
export class DriverTripCustomerDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mốc SĐT khách bắt đầu hiện (ISO-8601) — null khi đã hiện hoặc không bao giờ hiện',
  })
  contactVisibleFrom!: string | null;
}

export class DriverTripDto {
  @ApiProperty({ description: 'ID đơn thuê' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ description: 'Trạng thái đơn (BookingStatus)' }) status!: string;
  @ApiProperty({ enum: DRIVER_ASSIGNMENT_STATUS_VALUES }) assignmentStatus!: string;
  @ApiProperty({
    enum: DRIVER_ASSIGNMENT_OUTCOME_VALUES,
    description: 'Kết quả lượt của CHÍNH tài xế: open = đang giao; còn lại là chuyến ở tab Đã qua',
  })
  outcome!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) assignedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) respondedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Hạn tôi phải Nhận/Từ chối (ISO-8601, ADR 0066) — chỉ khác null khi chuyến còn chờ tôi trả lời. Quá hạn ⇒ chuyến được trả về bên thuê.',
  })
  respondBy!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lượt của tài xế kết thúc lúc',
  })
  endedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Mốc cuối tôi còn được TRẢ LẠI chuyến đã nhận (ISO-8601) — chỉ khác null khi chuyến của tôi đã nhận, đơn còn `reserved` và mốc chưa qua.',
  })
  releaseUntil!: string | null;
  @ApiProperty({
    description:
      'Tôi còn RÚT được khỏi chuyến này không (ADR 0074): chuyến của tôi, đã nhận, đơn chưa giao xe. Rút qua `POST /driver/trips/:id/drop`; trước `releaseUntil` thì không bị phạt.',
  })
  canDrop!: boolean;
  @ApiProperty() pickupAt!: string;
  @ApiProperty() returnAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) routeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
  @ApiProperty({ type: DriverTripVehicleDto }) vehicle!: DriverTripVehicleDto;
  @ApiProperty({ type: DriverEmployerDto }) employer!: DriverEmployerDto;
  @ApiProperty({ type: DriverTripCustomerDto }) customer!: DriverTripCustomerDto;
  @ApiProperty({
    type: DriverWageDto,
    description: 'Tiền công chuyến này — chủ xe trả trực tiếp, XePrime chỉ ghi nhận (ADR 0075)',
  })
  wage!: DriverWageDto;
}

export class DriverTripDetailDto extends DriverTripDto {
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupLatitude!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupLongitude!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) destinationLatitude!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) destinationLongitude!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualPickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualReturnAt!: string | null;
}

export class DriverTripPageDto {
  @ApiProperty({ type: [DriverTripDto] }) data!: DriverTripDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Body `POST /driver/trips/:id/drop` — tài xế rút khỏi chuyến đã nhận (ADR 0074). */
export class DropDriverTripDto {
  @ApiProperty({ enum: DRIVER_DROP_REASON_VALUES })
  @IsIn(DRIVER_DROP_REASON_VALUES)
  reasonCategory!: DriverDropReason;

  @ApiPropertyOptional({
    maxLength: DRIVER_DROP_NOTE_LENGTH.MAX,
    description: `Mô tả sự cố — bắt buộc ${DRIVER_DROP_NOTE_LENGTH.MIN}–${DRIVER_DROP_NOTE_LENGTH.MAX} ký tự khi chọn \`other\` (422 \`DRIVER_DROP_NOTE_REQUIRED\`)`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(DRIVER_DROP_NOTE_LENGTH.MAX)
  reason?: string;
}

/** Số việc đang chờ tài xế trả lời — huy hiệu ở menu tài khoản / tab chuyến. */
export class DriverPendingCountsDto {
  @ApiProperty({ description: 'Lời mời liên kết chờ trả lời' }) invites!: number;
  @ApiProperty({ description: 'Chuyến được gán chờ nhận' }) trips!: number;
  @ApiProperty({
    description:
      'Tài khoản đã từng có liên kết tài xế nào chưa (mọi trạng thái). false ⇒ giao diện ẩn hẳn khu tài xế.',
  })
  hasLinks!: boolean;
}
