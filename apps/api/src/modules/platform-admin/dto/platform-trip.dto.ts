import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_REQUEST_STATUS_LIVE_VALUES,
  PICKUP_PREFERENCE_VALUES,
  PLATFORM_TRIP_BOOKING_QUEUES,
  PLATFORM_TRIP_REQUEST_QUEUES,
  SERVICE_TYPE_VALUES,
  TENANT_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
  type PlatformTripBookingQueue,
  type PlatformTripRequestQueue,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_TRIP_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_TRIP_MAX_LIMIT };

/** Phần chung của hai hàng đợi: tìm kiếm, khoanh theo gian hàng, phân trang. */
class TripQueueQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên khách / tên xe / biển số / tên gian hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;

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

/** Hàng đợi đọc từ `booking_requests` — chưa có đơn. */
export class PlatformTripRequestListQueryDto extends TripQueueQueryDto {
  @ApiProperty({ enum: PLATFORM_TRIP_REQUEST_QUEUES })
  @IsIn(PLATFORM_TRIP_REQUEST_QUEUES)
  queue!: PlatformTripRequestQueue;
}

/** Hàng đợi đọc từ `bookings` — đơn đã ra đời. Dòng trả về là `PlatformBookingDto`. */
export class PlatformTripBookingListQueryDto extends TripQueueQueryDto {
  @ApiProperty({ enum: PLATFORM_TRIP_BOOKING_QUEUES })
  @IsIn(PLATFORM_TRIP_BOOKING_QUEUES)
  queue!: PlatformTripBookingQueue;
}

/** Dải tóm tắt — toàn sàn, hoặc khoanh theo một gian hàng (link từ hồ sơ đối tác). */
export class PlatformTripSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;
}

/** Số dòng của một hàng đợi + số dòng KHẨN trong đó (`tripUrgency` của `@xeprime/types`). */
export class PlatformTripQueueCountDto {
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Quá hạn/quá giờ, hoặc còn dưới ngưỡng khẩn' }) urgentCount!: number;
}

/** Khoá là `PLATFORM_TRIP_QUEUE`. */
export class PlatformTripQueueCountsDto {
  @ApiProperty({ type: PlatformTripQueueCountDto }) pending_approval!: PlatformTripQueueCountDto;
  @ApiProperty({ type: PlatformTripQueueCountDto }) awaiting_hold!: PlatformTripQueueCountDto;
  @ApiProperty({ type: PlatformTripQueueCountDto }) pickup_soon!: PlatformTripQueueCountDto;
  @ApiProperty({ type: PlatformTripQueueCountDto }) active!: PlatformTripQueueCountDto;
}

/** Hôm nay (giờ Việt Nam) có bao nhiêu lượt giao xe và trả xe theo lịch. */
export class PlatformTripTodayDto {
  @ApiProperty() pickups!: number;
  @ApiProperty() returns!: number;
}

export class PlatformTripSummaryDto {
  @ApiProperty({ description: 'ISO-8601 UTC — mốc server tính; web đếm ngược từ các mốc, không từ đây' })
  generatedAt!: string;
  @ApiProperty({ type: PlatformTripTodayDto }) today!: PlatformTripTodayDto;
  @ApiProperty({ type: PlatformTripQueueCountsDto }) queues!: PlatformTripQueueCountsDto;
}

/**
 * Một yêu cầu thuê trong hàng đợi vận hành — đủ để người trực biết AI đang chờ AI và gọi đúng
 * người. SĐT khách luôn ở dạng đã che (cùng luật với `PlatformBookingDto`); SĐT CHỦ XE hiện đủ —
 * nền tảng gọi chủ xe là việc của chính hàng đợi này.
 */
export class PlatformTripRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_LIVE_VALUES }) status!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd 091****678' })
  customerPhoneMasked!: string | null;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  returnAt!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Gói dài hạn (tháng)' })
  longTermPackageMonths!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: PICKUP_PREFERENCE_VALUES })
  pickupPreference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD (giờ VN)' })
  requestedPickupDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD (giờ VN)' })
  pickupWindowStartDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD (giờ VN)' })
  pickupWindowEndDate!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({
    description:
      'ISO-8601 UTC — hạn gian hàng phải trả lời (ADR 0044; độ dài động 15 phút–4 giờ, ADR 0066)',
  })
  respondBy!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Worker đã nhắc lần 1 (khi còn 60 phút tới hạn — bỏ qua nếu cửa sổ ngắn hơn)',
  })
  firstRemindedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Worker đã nhắc lần cuối (khi còn 15 phút tới hạn)',
  })
  finalRemindedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lúc chủ xe nhận chuyến' })
  decidedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hạn khách chuyển tiền giữ chỗ — chỉ có ở `awaiting_hold`',
  })
  holdExpiresAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số tiền giữ chỗ (string)' })
  holdAmount!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) tenantStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'SĐT chủ xe — để gọi' })
  ownerPhone!: string | null;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lần gần nhất nền tảng nhắc tay chủ xe về yêu cầu này (từ audit)',
  })
  lastPlatformRemindAt!: string | null;
}

export class PlatformTripRequestPageDto {
  @ApiProperty({ type: [PlatformTripRequestDto] }) data!: PlatformTripRequestDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PlatformTripRemindResultDto {
  @ApiProperty() requestId!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) remindedAt!: string;
}
