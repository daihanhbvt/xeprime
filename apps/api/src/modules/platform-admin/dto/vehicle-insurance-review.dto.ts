import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INSURANCE_ELIGIBILITY_GAP_VALUES } from '@xeprime/types';
import { VehicleDataValueDto } from '../../vehicle-data/dto/vehicle-data.dto';

/** Cà vẹt CÒN HIỆU LỰC của xe — các trường đã đọc / chủ xe đã nhập (ADR 0089). */
export class VehicleRegistrationReviewDto {
  @ApiProperty() documentId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) holderName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) chassisNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) engineNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Biển số trên cà vẹt khớp biển số khai của xe - `null` khi thiếu một trong hai',
  })
  plateMatches!: boolean | null;
  @ApiProperty({ description: 'Có ảnh cà vẹt để mở (qua endpoint ảnh, ghi audit mỗi lần)' })
  hasImage!: boolean;
}

/**
 * Khối "Bảo hiểm và giấy tờ" cho người duyệt xe (đợt rà Admin 16/11/2026) — CHỈ ĐỌC, dữ liệu SỐNG
 * của xe. Giá trị xe quyết định phí bảo hiểm vật chất xe khách trả và mức bồi thường (ADR 0088).
 */
export class VehicleInsuranceReviewDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá trị xe chủ xe khai (VND string)',
  })
  insuredValue!: string | null;
  @ApiPropertyOptional({
    type: VehicleDataValueDto,
    nullable: true,
    description: 'Giá trị tham khảo (ADR 0090) - `null` khi xe không gắn dữ liệu xe chuẩn có giá',
  })
  referenceValue!: VehicleDataValueDto | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% lệch giá trị khai so với tham khảo (dương = khai cao hơn)',
  })
  deviationPercent!: number | null;
  @ApiProperty({ description: 'Lệch quá ngưỡng `INSURED_VALUE_DEVIATION_WARN_PERCENT`' })
  deviationWarning!: boolean;
  @ApiProperty({
    enum: INSURANCE_ELIGIBILITY_GAP_VALUES,
    isArray: true,
    description: 'Điều kiện bảo hiểm vật chất xe còn thiếu - rỗng = đủ điều kiện',
  })
  eligibilityGaps!: string[];
  @ApiPropertyOptional({ type: VehicleRegistrationReviewDto, nullable: true })
  registration!: VehicleRegistrationReviewDto | null;
}

/** Ảnh cà vẹt — URL ký ngắn hạn, mỗi lần mở một dòng audit. */
export class VehicleRegistrationImageDto {
  @ApiProperty({ description: 'URL xem ảnh, sống ngắn' }) url!: string;
  @ApiProperty() expiresIn!: number;
}
