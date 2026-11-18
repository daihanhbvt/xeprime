import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PREMIUM_FALLBACK_REASON_VALUES,
  INSURANCE_PREMIUM_SOURCE_VALUES,
  type InsurancePremiumFallbackReason,
  type InsurancePremiumSource,
} from '@xeprime/types';

/** Phí thực tế của một hợp đồng bảo hiểm — ngăn chi tiết admin (ADR 0091 điều 2). */
export class InsurancePolicyPricingDto {
  @ApiProperty({ description: 'Phí bảo hiểm đã thu của khách (VND string)' })
  premiumAmount!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phí đối tác tính lúc cấp (MIC total_fee) - null khi chưa cấp',
  })
  partnerPremiumAmount!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đã thu - phí đối tác: dương = thu dư, âm = XePrime bù. null khi chưa cấp',
  })
  differenceAmount!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giá trị xe đã dùng tính phí' })
  insuredValue!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Bậc thời lượng đã áp: tới N ngày - null với sản phẩm theo ngày',
  })
  tierMaxDays!: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '% giá trị xe của bậc đã áp (chuỗi thập phân)',
  })
  tierPercent!: string | null;

  @ApiProperty({ description: 'Phí thu hộ bảo hiểm của nền tảng đã thu (ADR 0091 điều 3) - "0" khi không có' })
  serviceFeeAmount!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mốc đã tự hoàn phí bảo hiểm + phí thu hộ vào Ví điểm khách (ADR 0091 điều 7)',
  })
  refundedAt!: string | null;

  @ApiPropertyOptional({
    enum: INSURANCE_PREMIUM_SOURCE_VALUES,
    nullable: true,
    description:
      'Nguồn phí chốt lúc duyệt (ADR 0097): partner = hãng báo, formula = công thức dự phòng. null = hợp đồng trước ADR 0097',
  })
  premiumSource!: InsurancePremiumSource | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phí theo công thức bậc lúc duyệt - để so với số hãng báo',
  })
  formulaPremiumAmount!: string | null;

  @ApiPropertyOptional({
    enum: INSURANCE_PREMIUM_FALLBACK_REASON_VALUES,
    nullable: true,
    description: 'Vì sao dùng công thức thay vì số hãng báo',
  })
  premiumQuoteFallbackReason!: InsurancePremiumFallbackReason | null;
}

/** Một hợp đồng cần người xử lý gấp (ADR 0091 điều 7). */
export class InsuranceAttentionItemDto {
  @ApiProperty() policyId!: string;
  @ApiProperty({ enum: INSURANCE_POLICY_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tình trạng phía đối tác (MIC ttrang) - "3" = chưa nhận ảnh',
  })
  partnerStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastErrorCode!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mốc đã báo khẩn vì quá 2 giờ sau giao xe chưa cấp',
  })
  escalatedAt!: string | null;
  @ApiProperty() bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) handedOverAt!: string | null;
  @ApiProperty() returnAt!: string;
}

export class InsuranceAttentionPageDto {
  @ApiProperty({ description: 'Tổng số hợp đồng cần xử lý gấp' }) total!: number;
  @ApiProperty({ type: [InsuranceAttentionItemDto], description: 'Tối đa 50 dòng, cũ nhất trước' })
  items!: InsuranceAttentionItemDto[];
}
