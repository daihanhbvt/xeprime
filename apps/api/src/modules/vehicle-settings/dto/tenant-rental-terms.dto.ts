import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RENTAL_TERMS_GROUP_VALUES, RENTAL_TERMS_MAX_LENGTH, type RentalTermsGroup } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Điều khoản thuê của gian hàng cho MỘT nhóm dịch vụ (ADR 0112 điều 3). */
export class TenantRentalTermsItemDto {
  @ApiProperty({
    enum: RENTAL_TERMS_GROUP_VALUES,
    description: 'self_drive = Tự lái & Dài hạn, with_driver = Có tài xế',
  })
  serviceType!: RentalTermsGroup;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'null = chưa có điều khoản' })
  termsText!: string | null;
  @ApiProperty({ description: 'Khách phải xác nhận điều khoản trước khi gửi yêu cầu' })
  requireTermsAcceptance!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO - null khi chưa lưu' })
  updatedAt!: string | null;
}

/** GET/PUT /shop/rental-policies/terms - luôn đủ hai nhóm. */
export class TenantRentalTermsDto {
  @ApiProperty({ type: [TenantRentalTermsItemDto] }) items!: TenantRentalTermsItemDto[];
}

export class SaveTenantRentalTermsItemDto {
  @ApiProperty({ enum: RENTAL_TERMS_GROUP_VALUES })
  @IsIn(RENTAL_TERMS_GROUP_VALUES)
  serviceType!: RentalTermsGroup;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: RENTAL_TERMS_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(RENTAL_TERMS_MAX_LENGTH)
  termsText?: string | null;

  @ApiProperty()
  @IsBoolean()
  requireTermsAcceptance!: boolean;
}

/** PUT - nhóm nào gửi mới đổi; nhóm vắng giữ nguyên. */
export class SaveTenantRentalTermsDto {
  @ApiProperty({ type: [SaveTenantRentalTermsItemDto] })
  @IsArray()
  @ArrayMaxSize(RENTAL_TERMS_GROUP_VALUES.length)
  @ArrayUnique((i: SaveTenantRentalTermsItemDto) => i.serviceType)
  @ValidateNested({ each: true })
  @Type(() => SaveTenantRentalTermsItemDto)
  items!: SaveTenantRentalTermsItemDto[];
}
