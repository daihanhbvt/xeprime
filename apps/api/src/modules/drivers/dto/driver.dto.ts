import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DRIVER_ASSIGNMENT_OUTCOME_VALUES,
  DRIVER_ASSIGNMENT_STATUS_VALUES,
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
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as DRIVER_DEFAULT_LIMIT, MAX_LIMIT as DRIVER_MAX_LIMIT };

const PHONE_PATTERN = /^(0|\+?84)\d{9}$/;

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

export class MyDriverLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: DriverEmployerDto }) employer!: DriverEmployerDto;
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
  @ApiProperty() pickupAt!: string;
  @ApiProperty() returnAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) routeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
  @ApiProperty({ type: DriverTripVehicleDto }) vehicle!: DriverTripVehicleDto;
  @ApiProperty({ type: DriverEmployerDto }) employer!: DriverEmployerDto;
  @ApiProperty({ type: DriverTripCustomerDto }) customer!: DriverTripCustomerDto;
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
