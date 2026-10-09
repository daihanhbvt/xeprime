import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TENANT_STATUS_VALUES } from '@xeprime/types';

/** Số gian hàng theo từng trạng thái (zero-fill đủ key để FE khỏi check undefined). */
export class PlatformTenantStatusCountsDto {
  @ApiProperty() draft!: number;
  @ApiProperty() pending_review!: number;
  @ApiProperty() needs_revision!: number;
  @ApiProperty() active!: number;
  @ApiProperty() suspended!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty() expired!: number;
}

/** Gian hàng mới nhất — panel "Gian hàng mới" trên dashboard nền tảng. */
export class PlatformRecentTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/** Tổng quan nền tảng — một request cho toàn bộ stat card + panel. */
export class PlatformDashboardSummaryDto {
  @ApiProperty({ description: 'Tổng gian hàng (chưa xoá)' }) tenantTotal!: number;
  @ApiProperty({ type: PlatformTenantStatusCountsDto })
  tenantsByStatus!: PlatformTenantStatusCountsDto;

  @ApiProperty({ description: 'Listing đang hiển thị trên marketplace' }) listingActive!: number;
  @ApiProperty({ description: 'Tổng listing (mọi trạng thái)' }) listingTotal!: number;

  @ApiProperty({ description: 'Tổng đơn thuê toàn nền tảng (chưa xoá)' }) bookingTotal!: number;
  @ApiProperty({ description: 'Đơn thuê tạo trong tháng này (giờ VN)' }) bookingThisMonth!: number;

  @ApiProperty({ description: 'Hồ sơ chờ duyệt (mọi loại)' }) approvalPending!: number;
  @ApiProperty({ description: 'Chờ duyệt: gian hàng' }) approvalPendingTenant!: number;
  @ApiProperty({ description: 'Chờ duyệt: xe' }) approvalPendingVehicle!: number;

  @ApiProperty({ type: [PlatformRecentTenantDto] })
  recentTenants!: PlatformRecentTenantDto[];
}

// ── Tổng quan mở rộng (`GET /platform/dashboard/overview`) ──────────────────────────────────

/**
 * Một số đếm của kỳ này và CÙNG KỲ tháng trước (cùng số ngày đã trôi qua) — so mười ngày đầu tháng
 * với cả tháng trước là vẽ ra một cú sụt không có thật.
 */
export class PlatformPeriodCountDto {
  @ApiProperty({ description: 'Từ đầu tháng (giờ VN) tới hiện tại' }) current!: number;
  @ApiProperty({ description: 'Cùng số ngày, tháng trước' }) previous!: number;
}

/** Như `PlatformPeriodCountDto` nhưng cho TIỀN — chuỗi VND (ADR 0007). */
export class PlatformPeriodMoneyDto {
  @ApiProperty({ description: 'Từ đầu tháng (giờ VN) tới hiện tại — VND string' }) current!: string;
  @ApiProperty({ description: 'Cùng số ngày, tháng trước — VND string' }) previous!: string;
}

export class PlatformDashboardDayDto {
  @ApiProperty({ description: 'Ngày lịch `YYYY-MM-DD` giờ VN' }) date!: string;
  @ApiProperty({ description: 'Đơn thuê ra đời trong ngày (mọi trạng thái)' }) bookings!: number;
  @ApiProperty({ description: 'GMV của các đơn đó — VND string, cùng định nghĩa với `gmv`' })
  gmv!: string;
}

/** Hoạt động giao dịch — cần `platform.bookings.view` (đọc được mọi đơn thì đọc được tổng của chúng). */
export class PlatformDashboardActivityDto {
  @ApiProperty({
    type: PlatformPeriodCountDto,
    description: 'Đơn thuê RA ĐỜI trong kỳ, mọi trạng thái — cùng phép đếm `bookingThisMonth`.',
  })
  bookings!: PlatformPeriodCountDto;

  @ApiProperty({
    type: PlatformPeriodCountDto,
    description: 'Trong `bookings`: đơn đã huỷ hoặc khách không đến — phần không vào GMV.',
  })
  cancelled!: PlatformPeriodCountDto;

  @ApiProperty({
    type: PlatformPeriodMoneyDto,
    description:
      'GMV = Σ tiền thuê `B` (`bookings.total_amount`, KHÔNG gồm phí dịch vụ phía khách, bảo ' +
      'hiểm hay phụ phí) của đơn ra đời trong kỳ, trừ đơn huỷ/không đến.',
  })
  gmv!: PlatformPeriodMoneyDto;

  @ApiProperty({ type: [PlatformDashboardDayDto], description: '30 ngày gần nhất, cũ → mới, đủ ngày.' })
  series!: PlatformDashboardDayDto[];
}

export class PlatformDashboardGrowthDto {
  @ApiProperty({ type: PlatformPeriodCountDto, description: 'Tài khoản KHÁCH (realm customer) mới.' })
  newCustomers!: PlatformPeriodCountDto;

  @ApiProperty({
    type: PlatformPeriodCountDto,
    description: 'Đối tác mới — gian hàng/chủ xe (tenant) được tạo trong kỳ, cả hai tuyến.',
  })
  newPartners!: PlatformPeriodCountDto;
}

/**
 * Doanh thu của CHÍNH nền tảng — cần `platform.money.manage`. Cùng hai vị từ với đối soát ngày
 * (`BookingHoldsService.dailyReconciliation`), chỉ đổi cửa sổ.
 */
export class PlatformDashboardRevenueDto {
  @ApiProperty({
    type: PlatformPeriodMoneyDto,
    description:
      'Phí dịch vụ GHI NHẬN: Σ `settled_platform_amount` của khoản giữ chỗ đã chốt (`released_at` ' +
      'trong kỳ). Là số RÒNG sau tài trợ mã khuyến mãi — âm được (ADR 0046).',
  })
  serviceFee!: PlatformPeriodMoneyDto;

  @ApiProperty({
    type: PlatformPeriodMoneyDto,
    description: 'Tiền gói ĐÃ THU: Σ `paid_amount` của hoá đơn gói có `paid_at` trong kỳ.',
  })
  subscriptions!: PlatformPeriodMoneyDto;

  @ApiProperty({ type: PlatformPeriodMoneyDto, description: '`serviceFee + subscriptions`.' })
  total!: PlatformPeriodMoneyDto;
}

/**
 * Phễu kích hoạt đối tác — HIỆN TRẠNG, toàn thời gian, tenant chưa xoá. Mỗi bậc là tập con của bậc
 * trước (bậc sau đòi cả điều kiện của bậc trước), nên phễu không bao giờ "phình" ở giữa.
 */
export class PlatformDashboardFunnelDto {
  @ApiProperty({ description: 'Đối tác đã đăng ký' }) registered!: number;
  @ApiProperty({ description: '…có ít nhất một xe' }) withVehicle!: number;
  @ApiProperty({ description: '…đang có xe trên chợ (tin đăng active)' }) withListing!: number;
  @ApiProperty({ description: '…và đã có đơn thuê' }) withBooking!: number;
  @ApiProperty({ description: '…và đã hoàn thành ít nhất một chuyến' }) withCompletedTrip!: number;
}

/**
 * Tổng quan nền tảng mở rộng — KPI tháng, xu hướng 30 ngày, phễu. Khối nào cần quyền riêng thì
 * `null` khi người xem thiếu quyền đó (truy vấn của khối đó không chạy). Hàng đợi việc KHÔNG ở
 * đây: mỗi hàng đợi đã có endpoint đếm của chính nó, gác bằng quyền của chính nó.
 */
export class PlatformDashboardOverviewDto {
  @ApiProperty({ description: 'Thời điểm tính — ISO-8601 UTC' }) generatedAt!: string;
  @ApiProperty({ description: 'Tháng lịch hiện tại `YYYY-MM` giờ VN' }) period!: string;

  @ApiProperty({
    type: PlatformDashboardActivityDto,
    nullable: true,
    description: 'Cần `platform.bookings.view`.',
  })
  activity!: PlatformDashboardActivityDto | null;

  @ApiProperty({ type: PlatformDashboardGrowthDto }) growth!: PlatformDashboardGrowthDto;

  @ApiProperty({
    type: PlatformDashboardRevenueDto,
    nullable: true,
    description: 'Cần `platform.money.manage`.',
  })
  revenue!: PlatformDashboardRevenueDto | null;

  @ApiProperty({ type: PlatformDashboardFunnelDto }) funnel!: PlatformDashboardFunnelDto;
}
