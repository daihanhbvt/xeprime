import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUDIT_ACTION_CATEGORY_VALUES,
  AUDIT_ACTOR_SCOPE_VALUES,
  BOOKING_REQUEST_STATUS_VALUES,
  BOOKING_STATUS_VALUES,
  DEFAULT_PARTNER_VEHICLE_SORT,
  PARTNER_QUOTA_KIND_VALUES,
  PARTNER_VEHICLE_SORT_VALUES,
  PLATFORM_PARTNER_KIND_VALUES,
  QUOTA_LIMIT_REASON_VALUES,
  SERVICE_TYPE_VALUES,
  SHOP_VERIFICATION_VALUES,
  SUPPORT_SESSION_STATUS_VALUES,
  VEHICLE_ALERT_KIND_VALUES,
  VEHICLE_ALERT_SEVERITY,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  type AuditActionCategory,
  type AuditActorScope,
  type PartnerVehicleSort,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

/**
 * Read-model của drawer CHI TIẾT đối tác (Platform Admin) — toàn bộ là GET.
 *
 * Hai quy ước xuyên suốt:
 *  - **Tiền**: chuỗi Decimal hoặc `null`. `null` nghĩa là NGƯỜI GỌI không có quyền vận hành tiền
 *    (`platform.money.manage`) — server bỏ giá trị, không gửi rồi để client che.
 *  - **PII**: chỉ có dạng đã che (`…Masked`). Bản đầy đủ đi qua các luồng "hiện liên hệ" có audit
 *    riêng của từng màn, không bao giờ qua drawer này.
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export { DEFAULT_LIMIT as PARTNER_DETAIL_DEFAULT_LIMIT, MAX_LIMIT as PARTNER_DETAIL_MAX_LIMIT };

class PagedQueryDto {
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

/* ─────────────────────────────── Tổng quan ─────────────────────────────── */

export class PartnerOwnerDto {
  @ApiPropertyOptional({ type: String, nullable: true }) name!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phoneMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) emailMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: '@xeprime/types → UserStatus' })
  accountStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  joinedAt!: string | null;
}

export class PartnerIdentityDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({
    enum: PLATFORM_PARTNER_KIND_VALUES,
    description: 'Server suy từ tuyến (platformPartnerKindOf) — biến thể của drawer',
  })
  partnerKind!: string;
  @ApiProperty({ description: '@xeprime/types → TenantStatus' }) status!: string;
  @ApiProperty({ enum: SHOP_VERIFICATION_VALUES }) verification!: string;
  @ApiProperty({ description: '@xeprime/types → ShopOnboardingState' }) onboardingState!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiProperty({ description: 'Mặt tiền công khai mở được (gian hàng đang hoạt động)' })
  storefrontAvailable!: boolean;
}

export class PartnerCountsDto {
  @ApiProperty() vehicles!: number;
  @ApiProperty({ description: 'Xe đang hiển thị trên chợ' }) listed!: number;
  @ApiProperty({ description: 'Xe đang có khách thuê' }) renting!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Số xe có ít nhất một cảnh báo — null khi không có platform.vehicles.view',
  })
  vehiclesWithAlerts!: number | null;
}

export class PartnerAlertSummaryDto {
  @ApiProperty({ enum: VEHICLE_ALERT_KIND_VALUES }) kind!: string;
  @ApiProperty({ enum: Object.values(VEHICLE_ALERT_SEVERITY) }) severity!: string;
  @ApiProperty({ description: 'Số xe gặp cảnh báo này' }) vehicleCount!: number;
}

export class PartnerBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ description: '@xeprime/types → BranchStatus' }) status!: string;
  @ApiProperty() vehicleCount!: number;
}

/** Một hạn mức — BA trạng thái (`PARTNER_QUOTA_KIND`), không bao giờ suy nghĩa từ `limit = null`. */
export class PartnerQuotaItemDto {
  @ApiProperty() used!: number;
  @ApiProperty({ enum: PARTNER_QUOTA_KIND_VALUES }) kind!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Trần đang được cưỡng chế — chỉ khi kind = total',
  })
  limit!: number | null;
  @ApiPropertyOptional({
    enum: QUOTA_LIMIT_REASON_VALUES,
    nullable: true,
    description: 'Vì sao trần là con số đó (chỉ trần xe)',
  })
  reason!: string | null;
}

export class PartnerPlanSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true }) planName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) planCode!: string | null;
  @ApiProperty({ description: '@xeprime/types → BillingPhase' }) phase!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '@xeprime/types → BillingMode',
  })
  billingMode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  endsAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  graceEndsAt!: string | null;
  @ApiProperty({
    type: PartnerQuotaItemDto,
    description: 'Trần xe ĐANG CƯỠNG CHẾ (BillingService.vehicleQuotaFor) và số xe đã dùng',
  })
  vehicleQuota!: PartnerQuotaItemDto;
}

export class PartnerOperatingDto {
  @ApiProperty({ enum: SHOP_VERIFICATION_VALUES }) verification!: string;
  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Gian hàng gói: đã trả tiền gói lần đầu. null với chủ xe cá nhân',
  })
  onboardingCompleted!: boolean | null;
  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    description: 'Gian hàng gói: mục còn thiếu để gửi xe lên chợ (mã). null = không áp dụng',
  })
  listingRequirementsMissing!: string[] | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — dòng nhật ký gần nhất' })
  lastActivityAt!: string | null;
  @ApiProperty({ type: [String], description: 'Tỉnh/thành có chi nhánh hoặc điểm nhận xe' })
  areaNames!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) publicAddress!: string | null;
}

export class PartnerVehicleAlertDto {
  @ApiProperty({ enum: VEHICLE_ALERT_KIND_VALUES }) kind!: string;
  @ApiProperty({ enum: Object.values(VEHICLE_ALERT_SEVERITY) }) severity!: string;
}

export class PartnerVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
  @ApiProperty() vehicleType!: string;
  @ApiProperty({ type: [String] }) serviceTypes!: string[];
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
  @ApiProperty({ enum: VEHICLE_PUBLIC_STATUS_VALUES }) publicStatus!: string;
  @ApiProperty() isMarketplaceVisible!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) branchName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Khu vực nhận xe — phường/xã, tỉnh/thành của chi nhánh gắn xe',
  })
  pickupAreaName!: string | null;
  @ApiProperty({ type: [PartnerVehicleAlertDto], description: 'Đã sắp theo ưu tiên' })
  alerts!: PartnerVehicleAlertDto[];
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

export class PartnerBookingDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  @ApiProperty() customerNameMasked!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhoneMasked!: string | null;
  @ApiProperty({ description: 'ISO' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO' }) returnAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Decimal — null khi người gọi không có platform.money.manage',
  })
  totalAmount!: string | null;
}

export class PartnerOverviewDto {
  @ApiProperty({ type: PartnerIdentityDto }) identity!: PartnerIdentityDto;
  @ApiProperty({ type: PartnerOwnerDto }) owner!: PartnerOwnerDto;
  @ApiProperty({ type: PartnerCountsDto }) counts!: PartnerCountsDto;
  @ApiPropertyOptional({
    type: [PartnerAlertSummaryDto],
    nullable: true,
    description: 'null khi không có platform.vehicles.view',
  })
  alerts!: PartnerAlertSummaryDto[] | null;
  @ApiProperty({ type: PartnerOperatingDto }) operating!: PartnerOperatingDto;
  @ApiPropertyOptional({
    type: PartnerPlanSummaryDto,
    nullable: true,
    description: 'Chỉ gian hàng gói',
  })
  plan!: PartnerPlanSummaryDto | null;
  @ApiPropertyOptional({
    type: [PartnerBranchDto],
    nullable: true,
    description: 'Chỉ gian hàng gói',
  })
  branches!: PartnerBranchDto[] | null;
  @ApiPropertyOptional({
    type: [PartnerVehicleDto],
    nullable: true,
    description: 'null khi không có platform.vehicles.view',
  })
  recentVehicles!: PartnerVehicleDto[] | null;
  @ApiPropertyOptional({
    type: [PartnerBookingDto],
    nullable: true,
    description: 'null khi không có platform.bookings.view',
  })
  recentBookings!: PartnerBookingDto[] | null;
}

/* ─────────────────────────────── Xe ─────────────────────────────── */

export class PartnerVehicleListQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên / mã / biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: VEHICLE_OPERATION_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_OPERATION_STATUS_VALUES)
  operationStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_PUBLIC_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_PUBLIC_STATUS_VALUES)
  publicStatus?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ description: 'Chi nhánh (chỉ gian hàng gói) — id thuộc chính gian hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  branchId?: string;

  @ApiPropertyOptional({ enum: PARTNER_VEHICLE_SORT_VALUES, default: DEFAULT_PARTNER_VEHICLE_SORT })
  @IsOptional()
  @IsIn(PARTNER_VEHICLE_SORT_VALUES)
  sort?: PartnerVehicleSort;
}

export class PartnerVehiclePageDto {
  @ApiProperty({ type: [PartnerVehicleDto] }) data!: PartnerVehicleDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/* ─────────────────────────────── Đơn thuê & yêu cầu ─────────────────────────────── */

export class PartnerBookingListQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã đơn / biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: BOOKING_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ description: 'ISO — lọc theo giờ nhận xe' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO — lọc theo giờ nhận xe' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class PartnerBookingPageDto {
  @ApiProperty({ type: [PartnerBookingDto] }) data!: PartnerBookingDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PartnerBookingSummaryQueryDto {
  @ApiPropertyOptional({ description: 'ISO — lọc theo giờ nhận xe' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO — lọc theo giờ nhận xe' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class PartnerBookingSummaryDto {
  @ApiProperty({ description: 'Đơn đã chốt, chưa nhận xe' }) upcoming!: number;
  @ApiProperty({ description: 'Đang thuê' }) active!: number;
  @ApiProperty() completed!: number;
  @ApiProperty({ description: 'Huỷ + không đến nhận' }) cancelled!: number;
  @ApiProperty({ description: 'Tổng số đơn trong khoảng lọc' }) total!: number;
  @ApiProperty({
    description:
      'Đơn chưa nhận xe có giờ nhận trong PARTNER_PICKUP_SOON_HOURS tới — không theo khoảng lọc',
  })
  pickupSoon!: number;
  @ApiProperty({ description: 'Yêu cầu thuê đang chờ gian hàng duyệt' }) pendingRequests!: number;
  @ApiProperty({ description: 'Tổng số yêu cầu thuê' }) totalRequests!: number;
}

export class PartnerBookingRequestListQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_REQUEST_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_REQUEST_STATUS_VALUES)
  status?: string;
}

export class PartnerBookingRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  @ApiProperty() customerNameMasked!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhoneMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  returnAt!: string | null;
  @ApiProperty({ description: 'ISO — hạn gian hàng phải phản hồi' }) respondBy!: string;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
}

export class PartnerBookingRequestPageDto {
  @ApiProperty({ type: [PartnerBookingRequestDto] }) data!: PartnerBookingRequestDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/* ─────────────────────────────── Hồ sơ ─────────────────────────────── */

export class PartnerPublicProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true }) displayName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
}

export class PartnerLegalDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '@xeprime/types → SellerEntityType',
  })
  entityType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) legalName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxIdMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessLicenseNoMasked!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '@xeprime/types → SellerProfileStatus; null = chưa có hồ sơ người bán',
  })
  sellerStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  verifiedAt!: string | null;
}

export class PartnerIdentityVerificationDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '@xeprime/types → SellerProfileStatus; null = chưa gửi hồ sơ',
  })
  sellerStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) idNumberMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  verifiedAt!: string | null;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty() emailVerified!: boolean;
}

export class PartnerTenantDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: '@xeprime/types → TenantDocumentType' }) documentType!: string;
  @ApiProperty({ description: 'pending | approved | rejected' }) status!: string;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  reviewedAt!: string | null;
}

export class PartnerVehicleDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlateNumber!: string | null;
  @ApiProperty({ description: '@xeprime/types → VehicleDocumentType' }) type!: string;
  @ApiProperty({ description: '@xeprime/types → VehicleDocumentPresentation' })
  presentation!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  expiresAt!: string | null;
}

export class PartnerVerificationEventDto {
  @ApiProperty({ description: 'ISO' }) at!: string;
  @ApiProperty({ description: 'tenant | seller_profile' }) subject!: string;
  @ApiProperty({ description: '@xeprime/types → ApprovalStatus sau sự kiện' }) toStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actorName!: string | null;
}

export class PartnerProfileDto {
  @ApiPropertyOptional({
    type: PartnerPublicProfileDto,
    nullable: true,
    description: 'Mặt tiền — chỉ gian hàng gói',
  })
  publicProfile!: PartnerPublicProfileDto | null;
  @ApiProperty({ type: PartnerOwnerDto }) owner!: PartnerOwnerDto;
  @ApiPropertyOptional({ type: String, nullable: true }) publicPhoneMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) publicEmailMasked!: string | null;
  @ApiProperty({
    type: [PartnerBranchDto],
    description: 'Địa chỉ — chi nhánh (gói) / điểm nhận xe',
  })
  addresses!: PartnerBranchDto[];
  @ApiProperty({ type: [String] }) activityAreas!: string[];
  @ApiPropertyOptional({ type: PartnerLegalDto, nullable: true, description: 'Chỉ gian hàng gói' })
  legal!: PartnerLegalDto | null;
  @ApiPropertyOptional({
    type: PartnerIdentityVerificationDto,
    nullable: true,
    description: 'Chỉ chủ xe cá nhân',
  })
  identity!: PartnerIdentityVerificationDto | null;
  @ApiPropertyOptional({
    type: [PartnerTenantDocumentDto],
    nullable: true,
    description:
      'Giấy tờ pháp lý — null khi không có platform.sellers.verify. Không bao giờ có file',
  })
  documents!: PartnerTenantDocumentDto[] | null;
  @ApiPropertyOptional({
    type: [PartnerVehicleDocumentDto],
    nullable: true,
    description: 'Giấy tờ xe (chủ xe cá nhân) — null khi không có platform.vehicles.view',
  })
  vehicleDocuments!: PartnerVehicleDocumentDto[] | null;
  @ApiProperty({ type: [PartnerVerificationEventDto] })
  verificationHistory!: PartnerVerificationEventDto[];
}

/* ─────────────────────────────── Gói & phí (gian hàng gói) ─────────────────────────────── */

export class PartnerQuotaDto {
  @ApiProperty({ type: PartnerQuotaItemDto }) vehicles!: PartnerQuotaItemDto;
  @ApiProperty({ type: PartnerQuotaItemDto }) branches!: PartnerQuotaItemDto;
  @ApiProperty({ type: PartnerQuotaItemDto }) members!: PartnerQuotaItemDto;
}

export class PartnerFeatureStateDto {
  @ApiProperty({ description: '@xeprime/types → PlanFeature' }) feature!: string;
  @ApiProperty({ description: '@xeprime/types → FeatureState' }) state!: string;
}

export class PartnerFeePolicyDto {
  @ApiProperty({ description: 'Decimal — % phí dịch vụ XePrime của chính sách đang hiệu lực' })
  serviceFeePercent!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  effectiveFrom!: string | null;
}

export class PartnerInvoiceStatusDto {
  @ApiProperty({ description: 'Hoá đơn còn nợ (đã phát hành / trả một phần)' }) unpaid!: number;
  @ApiProperty({ description: 'Còn nợ, hết hạn trong 7 ngày tới' }) dueSoon!: number;
  @ApiProperty({ description: 'Còn nợ, đã quá hạn' }) overdue!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — hạn gần nhất' })
  nextDueAt!: string | null;
}

export class PartnerSubscriptionRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() planCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) billingMode!: string | null;
  @ApiProperty({ description: 'Decimal' }) price!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) termMonths!: number | null;
  @ApiProperty({ description: '@xeprime/types → SubscriptionStatus (lưu trữ)' }) status!: string;
  @ApiProperty({ description: 'ISO' }) startsAt!: string;
  @ApiProperty({ description: 'ISO' }) endsAt!: string;
}

export class PartnerInvoiceRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ description: 'ISO' }) periodFrom!: string;
  @ApiProperty({ description: 'ISO' }) periodTo!: string;
  @ApiProperty({ description: 'Decimal' }) totalAmount!: string;
  @ApiProperty({ description: 'Decimal' }) paidAmount!: string;
  @ApiProperty({ description: '@xeprime/types → SubscriptionInvoiceStatus' }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  expiresAt!: string | null;
}

export class PartnerBillingDto {
  @ApiProperty({ type: PartnerPlanSummaryDto }) plan!: PartnerPlanSummaryDto;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — bắt đầu kỳ hiện hành' })
  termStartsAt!: string | null;
  @ApiProperty({ type: PartnerQuotaDto }) quota!: PartnerQuotaDto;
  @ApiProperty({ type: [PartnerFeatureStateDto] }) features!: PartnerFeatureStateDto[];
  @ApiPropertyOptional({ type: PartnerFeePolicyDto, nullable: true })
  feePolicy!: PartnerFeePolicyDto | null;
  @ApiProperty({ type: PartnerInvoiceStatusDto }) invoiceStatus!: PartnerInvoiceStatusDto;
  @ApiProperty({ type: [PartnerSubscriptionRowDto], description: 'Mới nhất trước, tối đa 12' })
  subscriptions!: PartnerSubscriptionRowDto[];
  @ApiProperty({ type: [PartnerInvoiceRowDto], description: 'Mới nhất trước, tối đa 12' })
  invoices!: PartnerInvoiceRowDto[];
}

/* ─────────────────────────────── Hoa hồng & đối soát (chủ xe cá nhân) ─────────────────────────────── */

export class PartnerCommissionMonthDto {
  @ApiProperty({ description: 'YYYY-MM (giờ Việt Nam)' }) period!: string;
  @ApiProperty({ description: 'Tháng đã khép (không còn là tháng hiện tại)' }) closed!: boolean;
  @ApiProperty({ description: 'Số chuyến hoàn tất trong tháng' }) completedCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Decimal — Σ total_amount' })
  revenue!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Decimal — Σ service_fee_amount (phí dịch vụ XePrime, khách trả)',
  })
  serviceFee!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Decimal — Σ tax_amount' })
  tax!: string | null;
}

export class PartnerCommissionDto {
  @ApiPropertyOptional({ type: PartnerFeePolicyDto, nullable: true })
  feePolicy!: PartnerFeePolicyDto | null;
  @ApiProperty({ description: 'Người gọi có quyền xem số tiền' }) amountsVisible!: boolean;
  @ApiProperty({ description: 'Đơn đang chạy (đã chốt, chưa hoàn tất)' }) openBookings!: number;
  @ApiProperty({ description: 'Hỗ trợ/tranh chấp đang mở' }) openDisputes!: number;
  @ApiProperty({ type: [PartnerCommissionMonthDto], description: 'Mới nhất trước' })
  months!: PartnerCommissionMonthDto[];
}

/* ─────────────────────────────── Nhật ký ─────────────────────────────── */

export class PartnerActivityQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã hành động / tên người thực hiện' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTOR_SCOPE_VALUES })
  @IsOptional()
  @IsIn(AUDIT_ACTOR_SCOPE_VALUES)
  actorScope?: AuditActorScope;

  @ApiPropertyOptional({ enum: AUDIT_ACTION_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(AUDIT_ACTION_CATEGORY_VALUES)
  category?: AuditActionCategory;

  @ApiPropertyOptional({ description: 'ISO' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class PartnerActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: AUDIT_ACTION_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ enum: AUDIT_ACTOR_SCOPE_VALUES }) actorScope!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty() targetType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) targetId!: string | null;
  @ApiProperty({ description: 'Thao tác thực hiện trong một phiên hỗ trợ' }) viaSupport!: boolean;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
}

export class PartnerActivityPageDto {
  @ApiProperty({ type: [PartnerActivityDto] }) data!: PartnerActivityDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PartnerSupportSessionQueryDto extends PagedQueryDto {}

export class PartnerSupportSessionDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ description: '@xeprime/types → SupportMode' }) mode!: string;
  @ApiProperty({ description: '@xeprime/types → SupportWorkspace' }) workspace!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: SUPPORT_SESSION_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiProperty({ description: 'ISO' }) expiresAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  revokedAt!: string | null;
}

export class PartnerSupportSessionPageDto {
  @ApiProperty({ type: [PartnerSupportSessionDto] }) data!: PartnerSupportSessionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
