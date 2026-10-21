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
  TAX_PERCENT_MAX,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
      'Phút khách có để chuyển cọc khi đặt XA (giờ nhận cách lúc duyệt ≥ 24 giờ) — đồng thời là trần ' +
      'của cửa sổ động khi đặt cận ngày (ΔT × 40%, sàn 15 phút)',
    example: 120,
  })
  @IsInt()
  @Min(5)
  @Max(HOLD_PAYMENT_WINDOW_MINUTES_MAX)
  holdPaymentWindowMinutes!: number;

  @ApiProperty({
    description:
      'Giờ huỷ miễn phí KỂ TỪ khi duyệt khi đặt XA (≥ 24 giờ) — đồng thời là trần của cửa sổ động ' +
      '(ΔT × 30%; dưới 2 giờ thì không có huỷ miễn phí)',
    example: 4,
  })
  @IsInt()
  @Min(0)
  @Max(FREE_CANCEL_HOURS_MAX)
  freeCancelHours!: number;

  @ApiProperty({ description: '% cọc online trên TỔNG KHÁCH TRẢ trước mã khuyến mãi', example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(DEPOSIT_PERCENT_MIN)
  @Max(DEPOSIT_PERCENT_MAX)
  depositPercent!: number;

  @ApiProperty({ description: 'Sàn tiền cọc (VND string, bội 1.000đ)', example: '50000' })
  @IsNumberString()
  @IsMoneyStep({ message: 'Sàn tiền cọc phải là bội của 1.000đ' })
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
  @Max(TAX_PERCENT_MAX)
  taxPercent?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxLabel?: string | null;

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
  @ApiPropertyOptional({ type: Number, nullable: true }) taxPercent!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxLabel!: string | null;
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
