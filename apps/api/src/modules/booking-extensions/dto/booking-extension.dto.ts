import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt } from 'class-validator';
import {
  BILLING_MODE_VALUES,
  BOOKING_EXTENSION_STATUS_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
} from '@xeprime/types';
import { PaymentInfoDto } from '../../billing/dto/billing.dto';

/** Số tháng gia hạn — CHỈ bộ gói dài hạn (ADR 0077 điều 2: không gia hạn theo ngày). */
export class CreateBookingExtensionDto {
  @ApiProperty({ enum: LONG_TERM_PACKAGE_MONTHS, description: 'Số tháng gia hạn (gói dài hạn)' })
  @Type(() => Number)
  @IsInt()
  @IsIn([...LONG_TERM_PACKAGE_MONTHS])
  months!: number;
}

/** Tham số xem trước — cùng ràng buộc với lượt tạo. */
export class BookingExtensionQuoteQueryDto extends CreateBookingExtensionDto {}

/**
 * Báo giá MỘT phụ lục trước khi tạo — cùng hàm tính với lượt tạo (không lệch số giữa hai bước).
 * Bề mặt ĐỐI TÁC: có dòng phía chủ xe (thuế, phần cộng ví) — khách không bao giờ đọc DTO này.
 */
export class BookingExtensionQuoteDto {
  @ApiProperty() months!: number;
  @ApiProperty({ description: 'ISO - bắt đầu phụ lục = giờ trả hiện tại của đơn' }) fromAt!: string;
  @ApiProperty({ description: 'ISO - giờ trả mới (tháng lịch, giờ Việt Nam)' }) toAt!: string;
  @ApiProperty({ description: 'Số ngày lịch của phụ lục' }) rentalDays!: number;
  @ApiProperty({ description: 'Đơn giá tháng hiện hành của xe (VND string)' })
  monthlyPrice!: string;
  @ApiProperty({ description: 'Đơn giá tháng × số tháng (VND string)' }) basePackageAmount!: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: '% ưu đãi cam kết của mốc' })
  durationDiscountPercent!: number | null;
  @ApiProperty({ description: 'Ưu đãi cam kết (VND string)' }) durationDiscountAmount!: string;
  @ApiProperty({ description: '`B_ext` - tiền thuê phụ lục (VND string)' }) rentalAmount!: string;
  @ApiProperty({ description: '`T_ext` - thuế khấu trừ khỏi tiền chủ xe (VND string)' })
  taxAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vatAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pitAmount!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vatPercent!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) pitPercent!: number | null;
  @ApiProperty({ description: 'Khách chuyển cho XePrime qua QR (VND string)' })
  onlineAmount!: string;
  @ApiProperty({ description: 'Khách trả thẳng chủ xe (VND string)' }) payAtPickupAmount!: string;
  @ApiProperty({ description: 'Ví chủ xe được cộng khi chuyến kết thúc = D − T (VND string)' })
  ownerPayableAmount!: string;
  @ApiProperty({ description: 'Chủ xe thực nhận cả phụ lục = B − T (VND string)' })
  ownerNetAmount!: string;
  @ApiProperty({ enum: BILLING_MODE_VALUES, description: 'Tuyến lúc gia hạn' })
  billingMode!: string;
  @ApiProperty({ description: 'Xe trống trong khoảng gia hạn (xem trước - DB vẫn quyết lúc tạo)' })
  available!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO - xe bận từ mốc này nếu không trống',
  })
  busyFrom!: string | null;
}

/** Một phụ lục gia hạn — dùng cho bề mặt đối tác. */
export class BookingExtensionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã đối soát XPE… - NỘI DUNG chuyển khoản' }) code!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() months!: number;
  @ApiProperty() fromAt!: string;
  @ApiProperty() toAt!: string;
  @ApiProperty({ enum: BOOKING_EXTENSION_STATUS_VALUES }) status!: string;
  @ApiProperty() rentalAmount!: string;
  @ApiProperty() taxAmount!: string;
  @ApiProperty() onlineAmount!: string;
  @ApiProperty() payAtPickupAmount!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty({ description: 'Còn thiếu của khoản online, kẹp sàn 0' }) remainingAmount!: string;
  @ApiProperty({ description: 'Ví chủ xe được cộng khi chuyến kết thúc = D − T' })
  ownerPayableAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) expiresAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) activatedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) closedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: PaymentInfoDto, description: 'Tài khoản nhận tiền của nền tảng (VietQR)' })
  paymentInfo!: PaymentInfoDto;
}

/** Phụ lục nhìn từ phía KHÁCH — không có dòng phía chủ xe (ADR 0064 điều 11). */
export class CustomerBookingExtensionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã đối soát XPE… - NỘI DUNG chuyển khoản' }) code!: string;
  @ApiProperty() months!: number;
  @ApiProperty() fromAt!: string;
  @ApiProperty() toAt!: string;
  @ApiProperty({ enum: BOOKING_EXTENSION_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'Tiền thuê phần gia hạn (VND string)' }) rentalAmount!: string;
  @ApiProperty({ description: 'Chuyển cho XePrime qua QR (VND string)' }) onlineAmount!: string;
  @ApiProperty({ description: 'Trả thẳng chủ xe (VND string)' }) payAtPickupAmount!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty() remainingAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) expiresAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) activatedAt!: string | null;
  @ApiProperty({ type: PaymentInfoDto }) paymentInfo!: PaymentInfoDto;
}
