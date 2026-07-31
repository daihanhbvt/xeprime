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
