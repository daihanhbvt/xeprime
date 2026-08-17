import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CONTRACT_STATUS_VALUES } from '@xeprime/types';

/**
 * Snapshot hợp đồng — bản đông cứng lúc lập. Tiền là **string** (ADR 0007). Các DTO lồng nhau
 * để `@nestjs/swagger` sinh type đầy đủ cho FE (không để `object` trần).
 */
export class ContractPartyShopDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) province!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessLicenseNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountName!: string | null;
}

export class ContractPartyCustomerDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
}

export class ContractVehicleDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty() vehicleType!: string;
  @ApiProperty() serviceType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
}

export class ContractRentalDto {
  @ApiProperty() bookingCode!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({ description: 'Số ngày thuê (làm tròn lên)' }) days!: number;
  /**
   * Hành trình chuyến CÓ TÀI XẾ, đóng băng từ đơn lúc lập hợp đồng (17/08). Optional vì
   * snapshot đã ký trước đó không có các key này — FE chỉ render khi tồn tại.
   */
  @ApiPropertyOptional({ type: String, nullable: true }) routeType?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupAddress?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination?: string | null;
}

export class ContractPricingDto {
  @ApiProperty({ description: 'MoneyString' }) baseAmount!: string;
  @ApiProperty({ description: 'MoneyString' }) deliveryFee!: string;
  @ApiProperty({ description: 'MoneyString' }) discountAmount!: string;
  @ApiProperty({ description: 'MoneyString' }) totalAmount!: string;
  @ApiProperty({ description: 'MoneyString' }) depositAmount!: string;
  @ApiProperty({ description: 'MoneyString' }) paidAmount!: string;
  @ApiProperty({ description: 'MoneyString — còn phải trả = tổng − đã trả' }) remainingAmount!: string;
}

export class ContractSnapshotDto {
  @ApiProperty({ type: ContractPartyShopDto }) shop!: ContractPartyShopDto;
  @ApiProperty({ type: ContractPartyCustomerDto }) customer!: ContractPartyCustomerDto;
  @ApiProperty({ type: ContractVehicleDto }) vehicle!: ContractVehicleDto;
  @ApiProperty({ type: ContractRentalDto }) rental!: ContractRentalDto;
  @ApiProperty({ type: ContractPricingDto }) pricing!: ContractPricingDto;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ghi chú đơn' })
  note!: string | null;
}

export class ContractDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() contractNo!: string;
  @ApiProperty() templateVersion!: string;
  @ApiProperty({ enum: CONTRACT_STATUS_VALUES }) status!: string;
  @ApiProperty({ type: ContractSnapshotDto }) snapshot!: ContractSnapshotDto;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}
