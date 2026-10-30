import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEPOSIT_PERCENT_MAX,
  DEPOSIT_PERCENT_MIN,
  FEE_POLICY_STATUS_VALUES,
  FREE_CANCEL_HOURS_MAX,
  HOLD_PAYMENT_WINDOW_MINUTES_MAX,
  OWNER_COMMISSION_FROM_DAY_MAX,
  OWNER_COMMISSION_PERCENT_MAX,
  OWNER_COMMISSION_TIERS_MAX,
  SERVICE_FEE_PERCENT_MAX,
  SERVICE_FEE_PERCENT_MIN,
  TAX_LEGAL_BASIS_MAX_LENGTH,
  TAX_PIT_PERCENT_MAX,
  TAX_VAT_PERCENT_MAX,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoneyStep } from '../../../common/validators/money-step.validator';

/**
 * Số tiền cấu hình của luồng tiền v2: `0` hoặc một bội của 1.000đ, không phần thập phân.
 *
 * Kiểm ở MÉP chứ không chỉ ở cổng kích hoạt: CHECK `fee_policies_v2_amounts_thousand_step_check`
 * áp cho MỌI dòng kể cả bản nháp, nên một số lẻ lọt qua DTO sẽ thành lỗi 500 lúc lưu nháp thay
 * vì một câu 400 nói rõ ô nào sai.
 */
const THOUSAND_STEP_PATTERN = /^(0|[1-9]\d{0,8}000)$/;
const THOUSAND_STEP_MESSAGE = '$property phải là 0 hoặc bội của 1.000đ (chuỗi số nguyên)';

/**
 * Một số tiền cho TỪNG loại xe — `PerVehicleTypeAmount` ở `@xeprime/types`. Hai trường bắt buộc:
 * thiếu một loại là lỗi, không phải 0đ (một loại xe "quên" khai phí sàn là thu 0đ trên cả loại).
 */
export class PerVehicleTypeAmountDto {
  @ApiProperty({ description: 'Ô tô — VND, bội 1.000đ', example: '50000' })
  @Matches(THOUSAND_STEP_PATTERN, { message: THOUSAND_STEP_MESSAGE })
  car!: string;

  @ApiProperty({ description: 'Xe máy — VND, bội 1.000đ', example: '30000' })
  @Matches(THOUSAND_STEP_PATTERN, { message: THOUSAND_STEP_MESSAGE })
  motorbike!: string;
}

/** Khoảng tiền (VND, bội 1.000đ) — `0 < min < max` do `withDriverLimitsValid` canh ở service. */
export class MoneyRangeDto {
  @ApiProperty({ example: '200000' })
  @Matches(THOUSAND_STEP_PATTERN, { message: THOUSAND_STEP_MESSAGE })
  min!: string;

  @ApiProperty({ example: '2000000' })
  @Matches(THOUSAND_STEP_PATTERN, { message: THOUSAND_STEP_MESSAGE })
  max!: string;
}

/** Giới hạn chặn số vô lý của chuyến có tài xế — `WithDriverLimits` ở `@xeprime/types` (ADR 0075). */
export class WithDriverLimitsDto {
  @ApiProperty({ type: MoneyRangeDto, description: 'Giá có tài xế/ngày của xe' })
  @ValidateNested()
  @Type(() => MoneyRangeDto)
  priceDaily!: MoneyRangeDto;

  @ApiProperty({ type: MoneyRangeDto, description: 'Tiền công tài xế/ngày' })
  @ValidateNested()
  @Type(() => MoneyRangeDto)
  wageDaily!: MoneyRangeDto;

  @ApiProperty({
    description:
      'Tiền công/ngày GỢI Ý cho gian hàng chưa đặt mức chung — chỉ là lời nhắc, không tự ghi vào đâu; nằm trong wageDaily',
    example: '500000',
  })
  @Matches(THOUSAND_STEP_PATTERN, { message: THOUSAND_STEP_MESSAGE })
  wageDailySuggested!: string;
}

/**
 * MỘT nấc hoa hồng lũy tiến — áp `percent` cho mọi ngày thuê từ `fromDay` tới ngày liền trước
 * `fromDay` của nấc kế tiếp (`OwnerCommissionTier`). Thứ tự và "bắt đầu từ ngày 1" do
 * `feePolicyActivationBlockers` canh ở cổng kích hoạt — bản nháp được phép dở dang.
 */
export class OwnerCommissionTierDto {
  @ApiProperty({ description: 'Ngày thuê bắt đầu áp nấc này (tính từ 1)', example: 1 })
  @IsInt()
  @Min(1)
  @Max(OWNER_COMMISSION_FROM_DAY_MAX)
  fromDay!: number;

  @ApiProperty({
    description: `% giá thuê của ngày đó (0–${OWNER_COMMISSION_PERCENT_MAX})`,
    example: 10,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(OWNER_COMMISSION_PERCENT_MAX)
  percent!: number;
}

/**
 * Cặp tỷ lệ khấu trừ của MỘT loại dịch vụ — `TaxRate` ở `@xeprime/types` (ADR 0068 điều 1).
 * Trần mỗi sắc thuế là mức cao nhất của bảng NĐ 117/2025 (5%).
 */
export class TaxRateDto {
  @ApiProperty({ description: `% thuế GTGT khấu trừ thay (0–${TAX_VAT_PERCENT_MAX})`, example: 5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(TAX_VAT_PERCENT_MAX)
  vatPercent!: number;

  @ApiProperty({ description: `% thuế TNCN khấu trừ thay (0–${TAX_PIT_PERCENT_MAX})`, example: 2 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(TAX_PIT_PERCENT_MAX)
  pitPercent!: number;
}

/**
 * Bảng mức khấu trừ theo LOẠI DỊCH VỤ — `TaxRatesByServiceType` (ADR 0068 điều 1). Khoá là mã
 * `SERVICE_TYPE` trên dây; đủ cả ba (thiếu một loại là 400, không phải 0%).
 */
export class TaxRatesDto {
  @ApiProperty({ type: TaxRateDto, description: 'Tự lái — nhóm dịch vụ (NĐ 117: 5% + 2%)' })
  @IsDefined()
  @ValidateNested()
  @Type(() => TaxRateDto)
  self_drive!: TaxRateDto;

  @ApiProperty({ type: TaxRateDto, description: 'Thuê dài hạn — nhóm dịch vụ (NĐ 117: 5% + 2%)' })
  @IsDefined()
  @ValidateNested()
  @Type(() => TaxRateDto)
  long_term!: TaxRateDto;

  @ApiProperty({ type: TaxRateDto, description: 'Có tài xế — nhóm vận tải (NĐ 117: 3% + 1,5%)' })
  @IsDefined()
  @ValidateNested()
  @Type(() => TaxRateDto)
  with_driver!: TaxRateDto;
}

/**
 * Bộ số của MỘT phiên bản chính sách phí — ADR 0028 điều 2–3, luồng tiền v2 (20/10/2026).
 *
 * `*Enabled = false` là một CỔNG chưa mở, không phải tỷ lệ 0. DTO chỉ kiểm HÌNH DẠNG; điều kiện
 * "bật cổng phải có căn cứ" (thuế có tên loại thuế, bảo hiểm có đối tác thật và biểu phí cho mọi
 * loại xe) chặn ở `FeePoliciesService.activate` bằng `feePolicyActivationBlockers` — cùng hàm web
 * dùng để báo sớm — và chặn lần cuối bằng CHECK ở DB.
 *
 * ## Bốn trường của luồng tiền v2 là TUỲ CHỌN trên dây
 *
 * `customerPlatformFee`, `ownerCommissionTiers`, `vehicleProtectionDailyAmount`,
 * `tripInsuranceDailyAmount`: vắng mặt ⇒ tạo nháp lấy `FEE_SCHEDULE_DEFAULTS`, sửa nháp GIỮ số
 * đang có. Form quản trị đời trước không gửi chúng, và nó không được phép xoá trắng bộ số v2 của
 * một bản nháp chỉ vì nó chưa biết chúng tồn tại.
 */
export class UpsertFeePolicyDto {
  @ApiProperty({ example: 'Luồng tiền v2 — phí sàn cố định, hoa hồng lũy tiến' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({
    description:
      `LEGACY — % phí dịch vụ của mô hình cũ (${SERVICE_FEE_PERCENT_MIN}–${SERVICE_FEE_PERCENT_MAX}). ` +
      'Luồng tiền v2 không đọc trường này; vắng mặt ⇒ tạo nháp 0, sửa nháp giữ số cũ.',
    example: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(SERVICE_FEE_PERCENT_MIN)
  @Max(SERVICE_FEE_PERCENT_MAX)
  serviceFeePercent?: number;

  @ApiProperty({ description: 'Sàn khoản giữ chỗ (VND string, bội 1.000đ)', example: '20000' })
  @IsNumberString()
  // Chặn ngay lúc lưu NHÁP, không chỉ ở cổng kích hoạt (ADR 0064) — số này đi thẳng vào mã QR.
  @IsMoneyStep({ message: 'Sàn khoản giữ chỗ phải là bội của 1.000đ' })
  holdMinAmount!: string;

  @ApiProperty({
    description:
      'TRẦN của hạn chuyển tiền giữ chỗ (phút). Hạn thật = clamp(round(ΔT × 30%), 15 phút, trần) với ' +
      'ΔT = giờ nhận − lúc duyệt, tính xuôi từ lúc duyệt và kẹp bởi giờ nhận — ADR 0066',
    example: 120,
  })
  @IsInt()
  @Min(5)
  @Max(HOLD_PAYMENT_WINDOW_MINUTES_MAX)
  holdPaymentWindowMinutes!: number;

  @ApiProperty({
    description:
      'TRẦN của cửa sổ huỷ miễn phí (giờ). Cửa sổ thật = clamp(round(ΔT × 20%), 15 phút, trần) với ' +
      'ΔT = giờ nhận − lúc duyệt, tính xuôi từ lúc duyệt và kẹp bởi giờ nhận; 0 = tắt huỷ miễn phí — ' +
      'ADR 0066',
    example: 2,
  })
  @IsInt()
  @Min(0)
  @Max(FREE_CANCEL_HOURS_MAX)
  freeCancelHours!: number;

  @ApiProperty({
    description:
      '% phần chủ xe `D` trong tiền giữ chỗ, tính trên TIỀN THUÊ (sau khuyến mãi trực tiếp của xe, ' +
      'không gồm phí giao xe) — ADR 0066. Phí sàn, hoa hồng và bảo hiểm cộng THÊM trên D',
    example: 15,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DEPOSIT_PERCENT_MIN)
  @Max(DEPOSIT_PERCENT_MAX)
  depositPercent!: number;

  @ApiProperty({
    description: 'Sàn của `D` (VND string, bội 1.000đ): D = max(% × tiền thuê, sàn); 0 = không sàn',
    example: '0',
  })
  @IsNumberString()
  @IsMoneyStep({ message: 'Sàn phần giữ chỗ của chủ xe phải là bội của 1.000đ' })
  depositMinAmount!: string;

  @ApiProperty({ description: 'Trần % của `D` ở chính sách này', example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DEPOSIT_PERCENT_MIN)
  @Max(DEPOSIT_PERCENT_MAX)
  depositMaxPercent!: number;

  @ApiProperty({ description: 'Cổng khấu trừ thuế thay chủ xe (ADR 0068)' })
  @IsBoolean()
  taxEnabled!: boolean;

  /*
   * Bắt buộc khi BẬT thuế — kể cả ở bản nháp: CHECK `fee_policies_tax_requires_rates_check` áp cho
   * mọi dòng không phải archived, nên thiếu ở đây sẽ thành lỗi 500 lúc lưu thay vì một câu 400.
   * Tắt thuế thì hai trường bị bỏ qua và lưu null.
   */
  @ApiPropertyOptional({
    type: TaxRatesDto,
    nullable: true,
    description:
      'Bảng mức khấu trừ theo loại dịch vụ, tách GTGT/TNCN — bắt buộc khi taxEnabled (ADR 0068). ' +
      'Áp cho cá nhân và hộ kinh doanh; doanh nghiệp đã xác minh không bị khấu trừ.',
  })
  @ValidateIf((o: UpsertFeePolicyDto) => o.taxEnabled)
  @IsDefined()
  @ValidateNested()
  @Type(() => TaxRatesDto)
  taxRates?: TaxRatesDto | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Căn cứ pháp lý của việc khấu trừ — bắt buộc khi taxEnabled',
    example: 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
  })
  @ValidateIf((o: UpsertFeePolicyDto) => o.taxEnabled)
  @IsString()
  @Matches(/\S/, { message: 'Căn cứ pháp lý không được để trống' })
  @MaxLength(TAX_LEGAL_BASIS_MAX_LENGTH)
  taxLegalBasis?: string | null;

  @ApiProperty() @IsBoolean() tripInsuranceEnabled!: boolean;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'LEGACY — bảo hiểm tính theo NGÀY từ luồng tiền v2 (`tripInsuranceDailyAmount`)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  tripInsurancePercent?: number | null;

  @ApiProperty() @IsBoolean() vehicleProtectionEnabled!: boolean;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'LEGACY — bảo hiểm tính theo NGÀY từ luồng tiền v2 (`vehicleProtectionDailyAmount`)',
  })
  @IsOptional()
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

  @ApiPropertyOptional({
    type: PerVehicleTypeAmountDto,
    description: '`S` — phí sàn CỐ ĐỊNH mỗi đơn, phía khách, theo loại xe. Áp cho cả hai tuyến.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PerVehicleTypeAmountDto)
  customerPlatformFee?: PerVehicleTypeAmountDto;

  @ApiPropertyOptional({
    type: [OwnerCommissionTierDto],
    description:
      '`H` — nấc hoa hồng lũy tiến theo ngày của tuyến hoa hồng, `fromDay` tăng dần từ 1',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(OWNER_COMMISSION_TIERS_MAX)
  @ValidateNested({ each: true })
  @Type(() => OwnerCommissionTierDto)
  ownerCommissionTiers?: OwnerCommissionTierDto[];

  @ApiPropertyOptional({
    type: PerVehicleTypeAmountDto,
    description:
      '`IV` — biểu phí bảo hiểm vật chất xe MỖI NGÀY theo loại xe (khách tích chọn mới tính)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PerVehicleTypeAmountDto)
  vehicleProtectionDailyAmount?: PerVehicleTypeAmountDto;

  @ApiPropertyOptional({
    type: PerVehicleTypeAmountDto,
    description:
      '`IP` — biểu phí bảo hiểm tai nạn người MỖI NGÀY theo loại xe (khách tích chọn mới tính)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PerVehicleTypeAmountDto)
  tripInsuranceDailyAmount?: PerVehicleTypeAmountDto;

  @ApiPropertyOptional({
    type: WithDriverLimitsDto,
    description:
      'Giới hạn chặn số vô lý của chuyến có tài xế (ADR 0075). Vắng ⇒ giữ số của bản nháp (sửa) / mặc định nền tảng (tạo mới).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WithDriverLimitsDto)
  withDriverLimits?: WithDriverLimitsDto;
}

export class FeePolicyDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: FEE_POLICY_STATUS_VALUES }) status!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'LEGACY — luồng tiền v2 không đọc trường này' })
  serviceFeePercent!: number;
  @ApiProperty() holdMinAmount!: string;
  @ApiProperty() holdPaymentWindowMinutes!: number;
  @ApiProperty() freeCancelHours!: number;
  @ApiProperty() depositPercent!: number;
  @ApiProperty() depositMinAmount!: string;
  @ApiProperty() depositMaxPercent!: number;
  @ApiProperty() taxEnabled!: boolean;
  @ApiPropertyOptional({
    type: TaxRatesDto,
    nullable: true,
    description: 'Bảng mức khấu trừ theo loại dịch vụ (ADR 0068). null ở chính sách ≤ v8',
  })
  taxRates!: TaxRatesDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxLegalBasis!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'LEGACY (≤ v8) — một mức cho mọi chuyến; thay bằng taxRates',
  })
  taxPercent!: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'LEGACY (≤ v8) — nhãn của chính sách một-mức; thay bằng taxLegalBasis',
  })
  taxLabel!: string | null;
  @ApiProperty() tripInsuranceEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) tripInsurancePercent!: number | null;
  @ApiProperty() vehicleProtectionEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) vehicleProtectionPercent!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) insurancePartnerName!: string | null;
  @ApiProperty({ type: PerVehicleTypeAmountDto }) customerPlatformFee!: PerVehicleTypeAmountDto;
  @ApiProperty({ type: [OwnerCommissionTierDto] })
  ownerCommissionTiers!: readonly OwnerCommissionTierDto[];
  @ApiProperty({ type: PerVehicleTypeAmountDto })
  vehicleProtectionDailyAmount!: PerVehicleTypeAmountDto;
  @ApiProperty({ type: PerVehicleTypeAmountDto })
  tripInsuranceDailyAmount!: PerVehicleTypeAmountDto;
  @ApiProperty({
    type: WithDriverLimitsDto,
    description: 'Giới hạn chuyến có tài xế đang áp — bản chưa khai trả mặc định nền tảng',
  })
  withDriverLimits!: WithDriverLimitsDto;
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
