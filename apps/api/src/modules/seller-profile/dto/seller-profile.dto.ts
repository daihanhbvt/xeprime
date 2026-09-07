import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SELLER_ENTITY_TYPE_VALUES, SELLER_PROFILE_STATUS_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const SELLER_DEFAULT_LIMIT = 20;
export const SELLER_MAX_LIMIT = 100;

/**
 * Hồ sơ người bán do GIAN HÀNG khai — ADR 0028 release gate 1 (R3).
 *
 * Mọi trường optional ở tầng DTO: người bán lưu nháp dần. Điều kiện ĐỦ để gửi xác minh nằm ở
 * `SellerProfileService.submit` (`sellerProfileMissingFields`), vì nó phụ thuộc `entityType` —
 * doanh nghiệp cần MST, cá nhân cần CCCD.
 */
export class SaveSellerProfileDto {
  @ApiProperty({ enum: SELLER_ENTITY_TYPE_VALUES })
  @IsIn(SELLER_ENTITY_TYPE_VALUES)
  entityType!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên pháp lý / tên doanh nghiệp' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã số thuế' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9-]{10,20}$/, { message: 'Mã số thuế không hợp lệ' })
  taxId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số CCCD/hộ chiếu người đại diện' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,20}$/, { message: 'Số giấy tờ không hợp lệ' })
  idNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  idIssuedAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idIssuedBy?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã ngân hàng chuẩn VietQR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,20}$/, { message: 'Mã ngân hàng không hợp lệ' })
  bankCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9 ]{6,40}$/, { message: 'Số tài khoản không hợp lệ' })
  bankAccountNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bankAccountName?: string | null;
}

/**
 * Hồ sơ nhìn từ phía GIAN HÀNG — họ thấy đủ dữ liệu của chính mình.
 *
 * Số tài khoản và số giấy tờ trả ĐẦY ĐỦ ở đây có chủ đích: đây là dữ liệu của chính người đang
 * đọc, và che nó đi khiến họ không kiểm tra được mình gõ đúng chưa. Che chỉ áp ở bề mặt NỀN TẢNG
 * (danh sách admin) — xem `PlatformSellerProfileDto`.
 */
export class SellerProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SELLER_ENTITY_TYPE_VALUES }) entityType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) legalName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) idNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) idIssuedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) idIssuedBy!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountName!: string | null;
  @ApiProperty({ enum: SELLER_PROFILE_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) submittedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) verifiedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lý do khi cần bổ sung / từ chối' })
  reviewNote!: string | null;
  @ApiProperty({ description: 'Còn sửa được không (đang chờ xác minh thì không)' })
  editable!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Trường còn thiếu để GỬI xác minh — rỗng là gửi được',
  })
  missingFields!: string[];
}

/** Bề mặt NỀN TẢNG: danh sách che PII, chi tiết mở đủ (cần `platform.sellers.verify`). */
export class PlatformSellerProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: SELLER_ENTITY_TYPE_VALUES }) entityType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) legalName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Che ở danh sách; đủ ở chi tiết' })
  idNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Che ở danh sách; đủ ở chi tiết' })
  bankAccountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountName!: string | null;
  @ApiProperty({ enum: SELLER_PROFILE_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) submittedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) verifiedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) verifiedByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewNote!: string | null;
  @ApiProperty() updatedAt!: string;
}

export class PlatformSellerProfilePageDto {
  @ApiProperty({ type: [PlatformSellerProfileDto] }) data!: PlatformSellerProfileDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PlatformSellerListQueryDto {
  @ApiPropertyOptional({
    enum: SELLER_PROFILE_STATUS_VALUES,
    description: 'Bỏ trống = hàng đợi CHỜ XÁC MINH',
  })
  @IsOptional()
  @IsIn(SELLER_PROFILE_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên gian hàng / tên pháp lý / MST' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: SELLER_DEFAULT_LIMIT, minimum: 1, maximum: SELLER_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SELLER_MAX_LIMIT)
  limit?: number;
}

export class ReviewSellerProfileDto {
  @ApiProperty({
    description: 'Lý do — bắt buộc khi yêu cầu bổ sung hoặc từ chối; người bán đọc câu này',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}
