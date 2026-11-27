import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BANK_MATCH_STATUS_VALUES,
  BILLING_MODE_VALUES,
  BOOKING_DATE_FIELD,
  BOOKING_DATE_FIELD_VALUES,
  BOOKING_HOLD_OUTCOME_VALUES,
  BOOKING_HOLD_STATUS_VALUES,
  BOOKING_SOURCE_FILTER_VALUES,
  BOOKING_SOURCE_VALUES,
  BOOKING_STATUS_VALUES,
  CANCELLATION_PARTY_VALUES,
  CANCELLATION_REASON_CATEGORY_VALUES,
  CANCELLATION_STAGE_VALUES,
  HOLD_REFUND_REASON_VALUES,
  HOLD_REFUND_STATUS_VALUES,
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  REFUND_SETTLEMENT_MODE_VALUES,
  SERVICE_TYPE_VALUES,
  TAX_WITHHOLDING_STATUS_VALUES,
  TENANT_STATUS_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { OwnerPayoutDto } from '../../../common/dto/owner-payout.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_BOOKING_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_BOOKING_MAX_LIMIT };

/** Lọc đơn thuê toàn hệ thống (admin nền tảng). Mọi filter là AND. */
export class PlatformBookingListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã đơn / tên khách' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Tra chính xác theo SĐT khách' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo xe (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  vehicleId?: string;

  @ApiPropertyOptional({ enum: BOOKING_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_STATUS_VALUES)
  status?: string;

  /** Nguồn đơn (ADR 0110) - `xeprime` = đơn qua sàn, `direct` = mọi đơn chủ xe tự lập. */
  @ApiPropertyOptional({ enum: BOOKING_SOURCE_FILTER_VALUES })
  @IsOptional()
  @IsIn(BOOKING_SOURCE_FILTER_VALUES)
  source?: string;

  @ApiPropertyOptional({
    enum: BOOKING_DATE_FIELD_VALUES,
    default: BOOKING_DATE_FIELD.CREATED_AT,
    description: 'Khoảng ngày áp lên trường nào: ngày tạo đơn hay ngày nhận xe',
  })
  @IsOptional()
  @IsIn(BOOKING_DATE_FIELD_VALUES)
  dateField?: string;

  @ApiPropertyOptional({ description: 'Từ thời điểm (ISO-8601, inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Đến thời điểm (ISO-8601, inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

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

/**
 * Một đơn thuê trong danh sách giám sát.
 *
 * `customerPhone` LUÔN ở dạng đã che (build plan §11.1). Số đầy đủ lấy riêng qua
 * `GET /platform/bookings/:id/contact` — có permission riêng và ghi audit từng lần.
 */
export class PlatformBookingDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  /** Nguồn đơn (ADR 0110): `xeprime` = qua sàn; khác = chủ xe tự lập, ngoài sàn. */
  @ApiProperty({ enum: BOOKING_SOURCE_VALUES }) source!: string;
  @ApiProperty({ required: true, type: String, nullable: true, description: 'Nhãn nguồn tự nhập' })
  sourceLabel!: string | null;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd 091****678' })
  customerPhoneMasked!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) totalAmount!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) paidAmount!: string;
  @ApiProperty({ description: 'Công nợ = max(0, total − paid), string - ADR 0007' })
  debtAmount!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) tenantStatus!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlateNumber!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformBookingPageDto {
  @ApiProperty({ type: [PlatformBookingDto] }) data!: PlatformBookingDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

const MONEY = 'VND string (ADR 0007)';

/**
 * Bảng tiền MARKETPLACE của một đơn, đọc NGUYÊN từ bảng phí đã đóng băng (ADR 0024) — không tính
 * lại theo chính sách hôm nay. Phía chủ xe (`H`, `T`, phần chủ xe nhận) đi qua đúng `ownerPayoutOf`
 * mà site đối tác dùng, nên người trực nền tảng và chủ xe nhìn một đơn thấy cùng một con số.
 *
 * Chỉ đi trên DTO quản trị: phía chủ xe không bao giờ ra bề mặt khách (ADR 0064 điều 11).
 */
export class PlatformBookingFeesDto {
  @ApiProperty({ enum: BILLING_MODE_VALUES }) billingMode!: string;
  @ApiProperty({
    description: `\`B\` - tiền thuê sau khuyến mãi của xe, GỒM phí giao \`G\` - ${MONEY}`,
  })
  baseAmount!: string;
  @ApiProperty({ description: `\`G\` - phí giao xe, khách trả tay chủ xe - ${MONEY}` })
  deliveryAmount!: string;
  @ApiProperty({ description: `\`S\` - phí sàn phía khách, XePrime hưởng - ${MONEY}` })
  serviceFeeAmount!: string;
  @ApiProperty({ description: `\`IV\` - bảo hiểm vật chất xe, giữ hộ hãng - ${MONEY}` })
  vehicleInsuranceAmount!: string;
  @ApiProperty({ description: `\`IP\` - bảo hiểm tai nạn người, giữ hộ hãng - ${MONEY}` })
  personalInsuranceAmount!: string;
  @ApiProperty({ description: `Phí thu hộ bảo hiểm của nền tảng (ADR 0091 điều 3) - ${MONEY}` })
  insuranceServiceFeeAmount!: string;
  @ApiProperty({ description: `\`D\` - phần của chủ xe trong tiền giữ chỗ - ${MONEY}` })
  depositAmount!: string;
  @ApiProperty({ description: `\`P\` - mã khuyến mãi nền tảng tài trợ - ${MONEY}` })
  promoDiscountAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã khuyến mãi đã áp' })
  promoCode!: string | null;
  @ApiProperty({ description: `Tiền giữ chỗ TRƯỚC tài trợ mã - ${MONEY}` })
  grossOnlineAmount!: string;
  @ApiProperty({ description: `Tiền giữ chỗ khách phải chuyển (sau mã) - ${MONEY}` })
  onlineAmount!: string;
  @ApiProperty({ description: `Khách trả trực tiếp chủ xe lúc nhận xe (gồm \`G\`) - ${MONEY}` })
  payAtPickupAmount!: string;
  @ApiProperty({
    description: `Tổng khách trả cả chuyến = chuyển online + trả tay (đã trừ mã, chưa gồm cọc thế chấp) - ${MONEY}`,
  })
  customerTotalAmount!: string;
  @ApiProperty({ description: `\`S + H\` - XePrime giữ lại, TRƯỚC tài trợ mã - ${MONEY}` })
  platformRetainedAmount!: string;
  @ApiProperty({ description: `\`S + H − P\` - doanh thu thật của nền tảng, có thể âm - ${MONEY}` })
  platformNetAmount!: string;
  @ApiProperty({ type: OwnerPayoutDto, description: 'Phía chủ xe: R, H, T (GTGT/TNCN), cộng ví' })
  ownerPayout!: OwnerPayoutDto;
}

/** Năm phần đã chốt của một khoản giữ chỗ - chỉ có khi kết cục đã chốt. */
export class PlatformBookingHoldSettlementDto {
  @ApiProperty({ description: `Hoàn khách - ${MONEY}` }) customerAmount!: string;
  @ApiProperty({ description: `Về ví chủ xe (sau thuế) - ${MONEY}` }) ownerAmount!: string;
  @ApiProperty({ description: `XePrime giữ - ${MONEY}` }) platformAmount!: string;
  @ApiProperty({ description: `Phải trả hãng bảo hiểm - ${MONEY}` }) insurerAmount!: string;
  @ApiProperty({ description: `Thuế khấu trừ - ${MONEY}` }) taxAmount!: string;
}

/**
 * Khoản hoàn của khoản giữ chỗ. Tài khoản nhận và mã giao dịch chuyển tay chỉ có với người có
 * `platform.money.manage` - người chỉ có quyền xem đơn nhận `null`.
 */
export class PlatformBookingHoldRefundDto {
  @ApiProperty({ enum: HOLD_REFUND_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: MONEY }) amount!: string;
  @ApiProperty({ enum: HOLD_REFUND_REASON_VALUES }) reason!: string;
  @ApiProperty({ enum: REFUND_SETTLEMENT_MODE_VALUES, description: 'Vào Ví điểm hay chuyển khoản' })
  settlementMode!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ MONEY_MANAGE' })
  bankReference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ MONEY_MANAGE' })
  bankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ MONEY_MANAGE' })
  bankAccountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ MONEY_MANAGE' })
  bankAccountName!: string | null;
}

export class PlatformBookingHoldDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã đối soát `XPH…`' }) code!: string;
  @ApiProperty({ enum: BOOKING_HOLD_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ enum: BOOKING_HOLD_OUTCOME_VALUES, type: String, nullable: true })
  outcome!: string | null;
  @ApiProperty({ description: `Số phải chuyển - ${MONEY}` }) amount!: string;
  @ApiProperty({ description: `Số đã về - ${MONEY}` }) paidAmount!: string;
  @ApiProperty({ description: 'Hạn chuyển tiền - ISO-8601 UTC' }) expiresAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) freeCancelUntil!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lúc kết cục được chốt' })
  releasedAt!: string | null;
  @ApiPropertyOptional({ type: PlatformBookingHoldSettlementDto, nullable: true })
  settlement!: PlatformBookingHoldSettlementDto | null;
  @ApiPropertyOptional({ type: PlatformBookingHoldRefundDto, nullable: true })
  refund!: PlatformBookingHoldRefundDto | null;
}

/** Giao dịch ngân hàng đã khớp vào khoản giữ chỗ của đơn - chỉ người có `platform.money.manage`. */
export class PlatformBookingBankTxDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: MONEY }) amountIn!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giờ ngân hàng ghi' })
  bankTime!: string | null;
  @ApiProperty({ description: 'Lúc webhook về - ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({ enum: BANK_MATCH_STATUS_VALUES }) matchStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã FT của ngân hàng' })
  bankReferenceNumber!: string | null;
}

export class PlatformBookingInsuranceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: INSURANCE_PRODUCT_KIND_VALUES }) productKind!: string;
  @ApiProperty({ enum: INSURANCE_POLICY_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: MONEY }) premiumAmount!: string;
  @ApiProperty() partnerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) certificateNumber!: string | null;
  @ApiProperty({ description: 'GCN thử nghiệm (sandbox / mock)' }) isTest!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) issuedAt!: string | null;
  @ApiProperty({
    description:
      'Có GCN để tải qua `GET /platform/money/insurance/:id/certificate.pdf` (cần MONEY_MANAGE)',
  })
  certificateDownloadable!: boolean;
}

export class PlatformBookingTaxRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Kỳ YYYY-MM' }) periodKey!: string;
  @ApiProperty({ enum: TAX_WITHHOLDING_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: `Âm ở dòng đảo - ${MONEY}` }) amount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vatAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pitAmount!: string | null;
  @ApiProperty({ description: 'Dòng ĐẢO một dòng trước' }) isReversal!: boolean;
  @ApiProperty({ description: 'Dòng của phụ lục gia hạn' }) isExtension!: boolean;
}

export class PlatformBookingCancellationDto {
  @ApiProperty({
    enum: CANCELLATION_PARTY_VALUES,
    description: 'Phía chịu trách nhiệm - server suy',
  })
  responsibleParty!: string;
  @ApiProperty({ enum: CANCELLATION_REASON_CATEGORY_VALUES }) reasonCategory!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ enum: CANCELLATION_STAGE_VALUES }) stage!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) cancelledAt!: string;
}

/**
 * Khối TIỀN MARKETPLACE của chi tiết đơn - tách hẳn với "tiền của đơn" và "cọc thế chấp" (tiền giữ
 * chỗ khác cọc thế chấp - ADR 0044 điều 9).
 */
export class PlatformBookingMarketplaceDto {
  @ApiPropertyOptional({
    type: PlatformBookingFeesDto,
    nullable: true,
    description: '`null` = đơn không có bảng phí luồng tiền mới (đơn lập tay / đơn cũ)',
  })
  fees!: PlatformBookingFeesDto | null;
  @ApiPropertyOptional({ type: PlatformBookingHoldDto, nullable: true })
  hold!: PlatformBookingHoldDto | null;
  @ApiPropertyOptional({
    type: [PlatformBookingBankTxDto],
    nullable: true,
    description: '`null` = người gọi không có `platform.money.manage`',
  })
  bankTransactions!: PlatformBookingBankTxDto[] | null;
  @ApiProperty({ type: [PlatformBookingInsuranceDto] })
  insurancePolicies!: PlatformBookingInsuranceDto[];
  @ApiProperty({ type: [PlatformBookingTaxRowDto] }) taxRows!: PlatformBookingTaxRowDto[];
  @ApiPropertyOptional({ type: PlatformBookingCancellationDto, nullable: true })
  cancellation!: PlatformBookingCancellationDto | null;
}

/**
 * Case hỗ trợ CÒN MỞ của đơn (ADR 0095 điều 4) — để người xem đơn biết đơn đang bị giữ ở đâu và
 * mở thẳng case đó. Nút kết luận chỉ sống ở chi tiết case: một nơi ra quyết định.
 */
export class PlatformBookingSupportCaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ description: '`SUPPORT_CASE_CATEGORY`' }) category!: string;
  @ApiProperty({ description: '`SUPPORT_CASE_STATUS`' }) status!: string;
  @ApiProperty({ description: '`SUPPORT_CASE_PRIORITY`' }) priority!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({
    description:
      'Case có kết luận chuyến dùng được ngay bây giờ (`tripVerdictsFor`, ADR 0094 · 0095)',
  })
  tripVerdictAvailable!: boolean;
}

/** Chi tiết một đơn (drawer giám sát) — thêm phần tiền chi tiết và mốc thực tế. */
export class PlatformBookingDetailDto extends PlatformBookingDto {
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) baseAmount!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) deliveryFee!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) discountAmount!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) depositAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actualPickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualReturnAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({ description: 'Số phiếu thu/chi gắn đơn' }) receiptCount!: number;
  @ApiProperty({ description: 'Số lần ghi nhận thanh toán' }) paymentCount!: number;
  @ApiProperty({ description: 'Đơn đã lập hợp đồng chưa' }) hasContract!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
  @ApiProperty({ type: PlatformBookingMarketplaceDto })
  marketplace!: PlatformBookingMarketplaceDto;
  @ApiProperty({
    type: [PlatformBookingSupportCaseDto],
    description: 'Case hỗ trợ còn mở của đơn, cũ nhất trước (tối đa 10)',
  })
  openSupportCases!: PlatformBookingSupportCaseDto[];
}

/** SĐT khách ở dạng đầy đủ — trả về kèm việc ghi `audit_logs`. */
export class BookingContactDto {
  @ApiProperty() bookingId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
}
