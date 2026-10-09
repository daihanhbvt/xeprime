import { ApiProperty } from '@nestjs/swagger';
import {
  DASHBOARD_AGENDA_DAYS,
  DASHBOARD_AGENDA_KIND_VALUES,
  DASHBOARD_AGENDA_LIMIT,
  DASHBOARD_TREND_MONTHS,
  SERVICE_TYPE_VALUES,
  type DashboardAgendaKind,
  type ServiceType,
} from '@xeprime/types';
import { BranchIdQuery } from '../../../common/dto/branch-scope';
import { HostMetricsDto } from '../../public-listings/dto/public-listing.dto';

export class PartnerDashboardQueryDto {
  /**
   * Ô "Chi nhánh" của Tổng quan (ADR 0052) — thu hẹp MỌI khối đọc từ xe/đơn/yêu cầu cùng lúc.
   * Uy tín là chỉ số của cả gian hàng nên không đổi theo ô này.
   */
  @BranchIdQuery()
  branchId?: string;
}

/**
 * Việc giao/nhận xe — mỗi số là một tập CON của một danh sách có sẵn, để thẻ bấm vào ra đúng
 * danh sách tạo nên nó.
 */
export class PartnerDashboardTodayDto {
  @ApiProperty({
    description:
      'Đơn CHỜ GIAO XE — đúng tập của màn "Chờ giao xe" (`preset=awaiting_pickup`): đơn đã ' +
      'hình thành, xe chưa rời bãi. Gồm cả đơn đã quá giờ hẹn.',
  })
  awaitingPickup!: number;

  @ApiProperty({ description: 'Trong `awaitingPickup`: hẹn giao trong HÔM NAY (ngày lịch VN).' })
  pickupsToday!: number;

  @ApiProperty({
    description: 'Trong `awaitingPickup`: đã QUÁ giờ hẹn giao mà xe chưa rời bãi (mọi ngày).',
  })
  pickupsOverdue!: number;

  @ApiProperty({ description: 'Đơn đang thuê (`status = active`) — xe đang ở với khách.' })
  active!: number;

  @ApiProperty({ description: 'Trong `active`: hẹn trả trong HÔM NAY (ngày lịch VN).' })
  returnsToday!: number;

  @ApiProperty({ description: 'Trong `active`: đã QUÁ giờ hẹn trả (mọi ngày).' })
  returnsOverdue!: number;
}

/** Hộp thư yêu cầu — cùng phép đếm với hàng đợi vận hành chuyến của nền tảng. */
export class PartnerDashboardRequestsDto {
  @ApiProperty({ description: 'Yêu cầu đang chờ gian hàng duyệt (`pending_host_approval`).' })
  pending!: number;

  @ApiProperty({
    description:
      'Trong `pending`: còn ít hơn `TRIP_REQUEST_URGENT_MINUTES` phút tới hạn trả lời (gồm cả ' +
      'yêu cầu đã chạm hạn mà worker chưa quét) — cùng mốc với lượt nhắc cuối của hệ thống.',
  })
  pendingUrgent!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Hạn trả lời SỚM NHẤT trong các yêu cầu đang chờ — ISO-8601 UTC. Null = không có.',
  })
  nextRespondBy!: string | null;

  @ApiProperty({
    description: 'Đã nhận, chờ KHÁCH chuyển tiền giữ chỗ (`awaiting_hold`, ADR 0044).',
  })
  awaitingPayment!: number;
}

export class PartnerDashboardAgendaItemDto {
  @ApiProperty({ enum: DASHBOARD_AGENDA_KIND_VALUES })
  kind!: DashboardAgendaKind;

  @ApiProperty({ description: 'Giờ HẸN giao (pickup) hoặc trả (return) — ISO-8601 UTC.' })
  at!: string;

  @ApiProperty() bookingId!: string;
  @ApiProperty({ description: 'Mã đơn hiển thị' }) code!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty() customerName!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: ServiceType;
}

export class PartnerDashboardAgendaDto {
  @ApiProperty({
    type: [PartnerDashboardAgendaItemDto],
    description:
      `Tối đa ${DASHBOARD_AGENDA_LIMIT} mốc, xếp theo giờ hẹn tăng dần: mọi mốc đã QUÁ giờ, rồi ` +
      `các mốc tới hết ngày thứ ${DASHBOARD_AGENDA_DAYS} (tính cả hôm nay, giờ VN).`,
  })
  items!: PartnerDashboardAgendaItemDto[];

  @ApiProperty({ description: 'Còn mốc trong cửa sổ mà danh sách đã cắt bớt.' })
  hasMore!: boolean;
}

/**
 * Tháng này so với CÙNG KỲ tháng trước — cùng số ngày đã trôi qua, không phải cả tháng trước: so
 * mười ngày đầu tháng với ba mươi ngày của tháng trước là vẽ ra một cú sụt không có thật.
 */
export class PartnerDashboardMonthDto {
  @ApiProperty({ description: 'Tháng lịch hiện tại, `YYYY-MM` giờ VN.' })
  period!: string;

  @ApiProperty({ description: 'Đơn thuê RA ĐỜI từ đầu tháng tới hiện tại.' })
  newBookings!: number;

  @ApiProperty({ description: 'Cùng phép đếm, cùng số ngày, của tháng trước.' })
  newBookingsPrevious!: number;

  @ApiProperty({
    description:
      'Chuyến KẾT THÚC (completed) từ đầu tháng — cùng câu với "Số chuyến" của bảng tổng hợp ' +
      'giao dịch (`completedTripsInPeriodWhere`).',
  })
  completedTrips!: number;

  @ApiProperty({ description: 'Cùng phép đếm, cùng số ngày, của tháng trước.' })
  completedTripsPrevious!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Tỉ lệ lấp đầy (0–100, một chữ số thập phân): thời gian xe có khách (đơn đang thuê hoặc đã ' +
      'hoàn thành) ÷ thời gian xe có mặt trong đội (từ lúc tạo xe), trong kỳ. Null = chưa có xe ' +
      'nào trong kỳ — KHÔNG phải 0%.',
  })
  utilizationPercent!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Cùng phép tính cho cùng kỳ tháng trước.' })
  utilizationPercentPrevious!: number | null;
}

export class PartnerDashboardTrendPointDto {
  @ApiProperty({ description: 'Tháng lịch `YYYY-MM` giờ VN.' }) period!: string;
  @ApiProperty({ description: 'Đơn thuê ra đời trong tháng.' }) newBookings!: number;
  @ApiProperty({ description: 'Chuyến kết thúc (completed) trong tháng.' }) completedTrips!: number;
}

/** Xe trên chợ — trục HIỂN THỊ, khác trục vận hành của `/vehicles/fleet-summary`. */
export class PartnerDashboardMarketDto {
  @ApiProperty({
    description: 'Xe khách đang tìm thấy được — tin đăng `active` do `ListingsService` duy trì.',
  })
  onMarket!: number;

  @ApiProperty({ description: 'Xe đang chờ XePrime duyệt (`pending_public_review`).' })
  inReview!: number;

  @ApiProperty({ description: 'Xe XePrime yêu cầu sửa (`needs_revision`) — việc của gian hàng.' })
  needsRevision!: number;

  @ApiProperty({ description: 'Xe chưa gửi duyệt (`draft`).' })
  draft!: number;
}

/**
 * Tổng quan site partner — MỘT request cho cả màn, hai tuyến.
 *
 * Mỗi khối mang quyền riêng và là `null` khi người gọi không có quyền đó: một `shop_viewer` không
 * có quyền yêu cầu đặt xe nhận `requests: null` chứ không phải `0` — "không được xem" và "không có
 * yêu cầu nào" là hai câu khác nhau.
 */
export class PartnerDashboardOverviewDto {
  @ApiProperty({ description: 'Thời điểm tính — mọi mốc "hôm nay", "quá giờ" đều so với nó.' })
  generatedAt!: string;

  @ApiProperty({ type: PartnerDashboardTodayDto, nullable: true, description: 'Cần `bookings.view`.' })
  today!: PartnerDashboardTodayDto | null;

  @ApiProperty({
    type: PartnerDashboardRequestsDto,
    nullable: true,
    description: 'Cần `booking_requests.view`.',
  })
  requests!: PartnerDashboardRequestsDto | null;

  @ApiProperty({ type: PartnerDashboardAgendaDto, nullable: true, description: 'Cần `bookings.view`.' })
  agenda!: PartnerDashboardAgendaDto | null;

  @ApiProperty({ type: PartnerDashboardMonthDto, nullable: true, description: 'Cần `bookings.view`.' })
  month!: PartnerDashboardMonthDto | null;

  @ApiProperty({
    type: [PartnerDashboardTrendPointDto],
    nullable: true,
    description:
      `${DASHBOARD_TREND_MONTHS} tháng gần nhất, cũ → mới. Chỉ có ở TUYẾN GÓI có tính năng sổ ` +
      'tổng hợp (`finance` không `hidden`) và người gọi có `bookings.view` — báo cáo theo kỳ là ' +
      'năng lực của gói (ADR 0027 điều 1).',
  })
  trend!: PartnerDashboardTrendPointDto[] | null;

  @ApiProperty({ type: PartnerDashboardMarketDto, nullable: true, description: 'Cần `vehicles.view`.' })
  market!: PartnerDashboardMarketDto | null;

  @ApiProperty({
    type: HostMetricsDto,
    description:
      'Uy tín của CẢ gian hàng, cửa sổ công khai 90 ngày — đúng con số khách thấy trên chợ ' +
      '(`HostMetricsService`, ADR 0045). Không đổi theo ô chi nhánh.',
  })
  reputation!: HostMetricsDto;
}
