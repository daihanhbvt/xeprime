import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEPOSIT_PERCENT_MAX,
  DEPOSIT_PERCENT_MIN,
  FEE_POLICY_STATUS_VALUES,
  SERVICE_FEE_PERCENT_MAX,
  SERVICE_FEE_PERCENT_MIN,
} from '@xeprime/types';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Bộ số của MỘT phiên bản chính sách phí — ADR 0028 điều 2–3, ADR 0029 (R3).
 *
 * `*Enabled = false` là một CỔNG chưa mở, không phải tỷ lệ 0. DTO chỉ kiểm HÌNH DẠNG; điều kiện
 * "bật cổng phải có căn cứ" (thuế có tên loại thuế, bảo hiểm có đối tác thật) chặn ở
 * `FeePoliciesService.activate` bằng `feePolicyActivationBlockers` — cùng hàm web dùng để báo
 * sớm — và chặn lần cuối bằng CHECK ở DB.
 */
export class UpsertFeePolicyDto {
  @ApiProperty({ example: 'Pilot — phí dịch vụ 10%' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiProperty({
    description: `% phí dịch vụ XePrime áp cho tuyến hoa hồng (${SERVICE_FEE_PERCENT_MIN}–${SERVICE_FEE_PERCENT_MAX}). Tuyến gói luôn 0.`,
    example: 10,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(SERVICE_FEE_PERCENT_MIN)
  @Max(SERVICE_FEE_PERCENT_MAX)
  serviceFeePercent!: number;

  @ApiProperty({ description: 'Sàn khoản giữ chỗ (VND string)', example: '20000' })
  @IsNumberString()
  holdMinAmount!: string;

  @ApiProperty({
    description: 'Phút khách có để chuyển cọc, tính từ lúc chủ xe duyệt (ADR 0032 điều 2)',
    example: 120,
  })
  @IsInt()
  @Min(5)
  @Max(7 * 24 * 60)
  holdPaymentWindowMinutes!: number;

  @ApiProperty({
    description: 'Huỷ trong bấy nhiêu giờ KỂ TỪ khi duyệt thì hoàn 100% (ADR 0032 điều 5)',
    example: 4,
  })
  @IsInt()
  @Min(0)
  @Max(24 * 30)
  freeCancelHours!: number;

  @ApiProperty({ description: 'D — % cọc trên giá thuê gốc', example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DEPOSIT_PERCENT_MIN)
  @Max(DEPOSIT_PERCENT_MAX)
  depositPercent!: number;

  @ApiProperty({ description: 'Sàn tiền cọc (VND string)', example: '50000' })
  @IsNumberString()
  depositMinAmount!: string;

  @ApiProperty({ description: 'Trần % cọc của chính sách này', example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DEPOSIT_PERCENT_MIN)
  @Max(DEPOSIT_PERCENT_MAX)
  depositMaxPercent!: number;

  @ApiProperty() @IsBoolean() taxEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf((o: UpsertFeePolicyDto) => o.taxEnabled)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  taxPercent?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxLabel?: string | null;

  @ApiProperty() @IsBoolean() tripInsuranceEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf((o: UpsertFeePolicyDto) => o.tripInsuranceEnabled)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  tripInsurancePercent?: number | null;

  @ApiProperty() @IsBoolean() vehicleProtectionEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf((o: UpsertFeePolicyDto) => o.vehicleProtectionEnabled)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  vehicleProtectionPercent?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đối tác bảo hiểm THẬT — chỉ điền khi đã có hợp đồng (ADR 0028 điều 5)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  insurancePartnerName?: string | null;
}

export class FeePolicyDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: FEE_POLICY_STATUS_VALUES }) status!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() serviceFeePercent!: number;
  @ApiProperty() holdMinAmount!: string;
  @ApiProperty() holdPaymentWindowMinutes!: number;
  @ApiProperty() freeCancelHours!: number;
  @ApiProperty() depositPercent!: number;
  @ApiProperty() depositMinAmount!: string;
  @ApiProperty() depositMaxPercent!: number;
  @ApiProperty() taxEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) taxPercent!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxLabel!: string | null;
  @ApiProperty() tripInsuranceEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) tripInsurancePercent!: number | null;
  @ApiProperty() vehicleProtectionEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) vehicleProtectionPercent!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) insurancePartnerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) effectiveFrom!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) effectiveTo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) activatedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) activatedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  /**
   * Lý do CHƯA kích hoạt được (khoá của `feePolicyActivationBlockers`) — rỗng là được. Trả cùng
   * dòng để form admin báo ngay, không phải bấm rồi mới biết.
   */
  @ApiProperty({ type: [String] }) activationBlockers!: string[];
}
