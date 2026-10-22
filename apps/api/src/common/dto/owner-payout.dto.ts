import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TAX_EXEMPT_REASON, type TaxExemptReason } from '@xeprime/types';
import { OwnerCommissionTierDto } from '../../modules/fee-policies/dto/fee-policy.dto';

const TAX_EXEMPT_REASON_VALUES = Object.values(TAX_EXEMPT_REASON);

/**
 * BẢNG CỘNG VÍ CHỦ XE (ADR 0068 điều 5 · đặc tả 05 §7.1) — MỘT hình dạng cho hộp duyệt yêu cầu và
 * chi tiết đơn, dựng bằng MỘT hàm (`ownerPayoutOf`). Chỉ đi trên DTO của đối tác/quản trị: khách
 * không bao giờ thấy phí dịch vụ chủ xe, thuế hay phần của chủ xe (ADR 0064 điều 11).
 *
 * Ba đẳng thức đúng tới ĐỒNG ở mọi đầu vào (server dựng từ cùng các dòng snapshot):
 *
 *     ownerNetAmount (a)         = rentAmount − ownerCommissionAmount − taxAmount   (R − H − T)
 *     payAtPickupRentAmount (b)  = rentAmount − D − ownerCommissionAmount            (R − D − H)
 *     ownerPayableAmount         = a − b                                             (D − T)
 *
 * Tiền là chuỗi VND đúng tới đồng (ADR 0069) — client hiện nguyên, không làm tròn.
 */
export class OwnerPayoutDto {
  @ApiProperty({
    description:
      'Doanh thu cho thuê xe `R` — tiền thuê sau khuyến mãi của xe, KHÔNG gồm phí giao xe, phí đặt ' +
      'xe, bảo hiểm (VND string)',
  })
  rentAmount!: string;

  @ApiProperty({ description: 'Số ngày thuê tính phí' })
  rentalDays!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Đơn giá thuê / ngày — CHỈ khi mọi ngày cùng một giá (biết được từ giá từng ngày, hoặc chuyến ' +
      '1 ngày). `null` = giá khác nhau theo ngày hoặc không biết ⇒ hiện "Tiền thuê N ngày"',
  })
  unitAmount!: string | null;

  @ApiProperty({
    description: '`H` — phí dịch vụ – chủ xe (lũy tiến theo ngày). `0` ở tuyến gói (VND string)',
  })
  ownerCommissionAmount!: string;

  @ApiProperty({
    type: () => [OwnerCommissionTierDto],
    nullable: true,
    description:
      'Nấc lũy tiến của CHÍNH SÁCH ĐÃ ĐÓNG BĂNG cùng bảng phí (`fromDay` tăng dần) — đúng các nấc ' +
      'đã tính ra `H`. `null` ở tuyến gói, hoặc snapshot không mang nấc (trước luồng tiền v2) ⇒ ' +
      'màn hình giải thích chung, không có con số',
  })
  commissionTiers!: OwnerCommissionTierDto[] | null;

  @ApiProperty({ description: '`T` = GTGT + TNCN — thuế khấu trừ, nộp thay (VND string)' })
  taxAmount!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phần GTGT của `T`. `null` = snapshot trước ADR 0068 (một mức, không tách)',
  })
  vatAmount!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phần TNCN của `T`. `null` = snapshot trước ADR 0068 (một mức, không tách)',
  })
  pitAmount!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% GTGT đã áp. `null` khi không khấu trừ hoặc snapshot cũ',
  })
  vatPercent!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% TNCN đã áp. `null` khi không khấu trừ hoặc snapshot cũ',
  })
  pitPercent!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Tổng % thuế đã áp (`vat + pit`, hoặc mức đơn của snapshot cũ). `null` khi không khấu trừ',
  })
  taxTotalPercent!: number | null;

  @ApiPropertyOptional({
    enum: TAX_EXEMPT_REASON_VALUES,
    type: String,
    nullable: true,
    description:
      'Vì sao KHÔNG khấu trừ dù cổng thuế mở — `company` = doanh nghiệp đã xác minh (ADR 0068 điều 2)',
  })
  taxExemptReason!: TaxExemptReason | null;

  @ApiProperty({ description: 'Thu nhập chủ xe (a) = `R − H − T` (VND string)' })
  ownerNetAmount!: string;

  @ApiProperty({
    description:
      'Khách thanh toán trực tiếp (b) = `R − D − H` — phần TIỀN THUÊ khách trả tay lúc nhận xe, ' +
      'không gồm phí giao xe (VND string)',
  })
  payAtPickupRentAmount!: string;

  @ApiProperty({
    description: 'Số tiền cộng ví (a − b) = `D − T` — ghi có khi chuyến hoàn thành (VND string)',
  })
  ownerPayableAmount!: string;

  @ApiProperty({
    description:
      'Chuyến có thu tiền giữ chỗ online không. `false` (báo giá tạm tính) ⇒ không có khoản nào ' +
      'đi qua XePrime, (b) và số cộng ví không có nghĩa',
  })
  collectsHold!: boolean;
}
