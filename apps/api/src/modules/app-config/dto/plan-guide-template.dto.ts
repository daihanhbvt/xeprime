import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PLAN_GUIDE_VARIANT,
  PLAN_GUIDE_VARIANT_VALUES,
  PLAN_GUIDE_TEMPLATE_BODY_MAX,
  PLAN_GUIDE_TEMPLATE_CODE_PATTERN,
  PLAN_GUIDE_TEMPLATE_SUBJECT_MAX,
  SUPPORTED_LOCALES,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const PLAN_GUIDE_TEMPLATE_DEFAULT_LIMIT = 20;
export const PLAN_GUIDE_TEMPLATE_MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Dòng danh sách — không kèm thân HTML (nặng). */
export class PlanGuideTemplateSummaryDto {
  @ApiProperty({ example: '01J8XK2M5N7P9Q1R3S5T7V9W1X' }) id!: string;
  @ApiProperty({ example: 'clean_minimal' }) code!: string;
  @ApiProperty({ example: 'Tối giản' }) name!: string;
  @ApiProperty({ description: 'Đúng MỘT bộ đang dùng — DB gác bằng partial unique index.' })
  isActive!: boolean;
  @ApiProperty({ example: 1, description: 'Tăng 1 mỗi lần sửa.' }) version!: number;
  @ApiProperty({ example: '2026-10-12T03:00:00.000Z' }) createdAt!: string;
  @ApiProperty({ example: '2026-10-12T03:00:00.000Z' }) updatedAt!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Nguyễn Văn A' })
  updatedByName!: string | null;
}

/** Một nội dung trong bộ mẫu (PLAN_GUIDE_VARIANT). */
export class PlanGuideTemplateVariantDto {
  @ApiProperty({ enum: PLAN_GUIDE_VARIANT_VALUES, example: 'welcome' }) variant!: string;
  @ApiProperty({ example: 'Hướng dẫn đăng ký gói gian hàng trên website XePrime' }) subjectVi!: string;
  @ApiProperty({ example: 'How to subscribe to a shop plan on the XePrime website' }) subjectEn!: string;
  @ApiProperty({ description: 'HTML có biến {{name}} — xem PLAN_GUIDE_PLACEHOLDER.' }) bodyVi!: string;
  @ApiProperty() bodyEn!: string;
}

export class PlanGuideTemplateDto extends PlanGuideTemplateSummaryDto {
  @ApiProperty({
    type: [PlanGuideTemplateVariantDto],
    description: 'ĐỦ bốn nội dung, theo thứ tự PLAN_GUIDE_VARIANT (welcome · expiring · expired · grace).',
  })
  variants!: PlanGuideTemplateVariantDto[];
}

/** Nội dung khi TẠO bộ — bắt buộc đủ tiêu đề + thân hai ngôn ngữ. */
export class PlanGuideTemplateVariantInputDto {
  @ApiProperty({ enum: PLAN_GUIDE_VARIANT_VALUES })
  @IsIn(PLAN_GUIDE_VARIANT_VALUES)
  variant!: string;

  @ApiProperty({ maxLength: PLAN_GUIDE_TEMPLATE_SUBJECT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_SUBJECT_MAX)
  subjectVi!: string;

  @ApiProperty({ maxLength: PLAN_GUIDE_TEMPLATE_SUBJECT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_SUBJECT_MAX)
  subjectEn!: string;

  @ApiProperty({ maxLength: PLAN_GUIDE_TEMPLATE_BODY_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_BODY_MAX)
  bodyVi!: string;

  @ApiProperty({ maxLength: PLAN_GUIDE_TEMPLATE_BODY_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_BODY_MAX)
  bodyEn!: string;
}

/** Sửa MỘT nội dung — chỉ trường gửi lên mới đổi. */
export class PlanGuideTemplateVariantPatchDto {
  @ApiProperty({ enum: PLAN_GUIDE_VARIANT_VALUES })
  @IsIn(PLAN_GUIDE_VARIANT_VALUES)
  variant!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_SUBJECT_MAX)
  subjectVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_SUBJECT_MAX)
  subjectEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_BODY_MAX)
  bodyVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PLAN_GUIDE_TEMPLATE_BODY_MAX)
  bodyEn?: string;
}

export class PlanGuideTemplatePageDto {
  @ApiProperty({ type: [PlanGuideTemplateSummaryDto] }) data!: PlanGuideTemplateSummaryDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PlanGuideTemplateListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã / tên' })
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

  @ApiPropertyOptional({
    default: PLAN_GUIDE_TEMPLATE_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PLAN_GUIDE_TEMPLATE_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreatePlanGuideTemplateDto {
  @ApiProperty({ example: 'summer_promo', pattern: PLAN_GUIDE_TEMPLATE_CODE_PATTERN.source })
  @Transform(trim)
  @IsString()
  @Matches(PLAN_GUIDE_TEMPLATE_CODE_PATTERN)
  code!: string;

  @ApiProperty({ example: 'Mẫu mùa hè' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    type: [PlanGuideTemplateVariantInputDto],
    description: 'ĐỦ bốn nội dung, mỗi PLAN_GUIDE_VARIANT đúng một lần.',
  })
  @IsArray()
  @ArrayMinSize(PLAN_GUIDE_VARIANT_VALUES.length)
  @ArrayMaxSize(PLAN_GUIDE_VARIANT_VALUES.length)
  @ValidateNested({ each: true })
  @Type(() => PlanGuideTemplateVariantInputDto)
  variants!: PlanGuideTemplateVariantInputDto[];
}

/** Sửa một phần. Mã KHÔNG đổi được (nó là định danh trong audit/seed). */
export class UpdatePlanGuideTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    type: [PlanGuideTemplateVariantPatchDto],
    description: 'Sửa từng nội dung — chỉ nội dung/trường gửi lên mới đổi.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PLAN_GUIDE_VARIANT_VALUES.length)
  @ValidateNested({ each: true })
  @Type(() => PlanGuideTemplateVariantPatchDto)
  variants?: PlanGuideTemplateVariantPatchDto[];

  @ApiPropertyOptional({
    example: 3,
    description: 'Khoá lạc quan: gửi `version` đang sửa ⇒ 409 CONFLICT nếu người khác đã lưu trước.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class DuplicatePlanGuideTemplateDto {
  @ApiProperty({ example: 'clean_minimal_copy', pattern: PLAN_GUIDE_TEMPLATE_CODE_PATTERN.source })
  @Transform(trim)
  @IsString()
  @Matches(PLAN_GUIDE_TEMPLATE_CODE_PATTERN)
  code!: string;

  @ApiPropertyOptional({ description: 'Bỏ trống = "<tên cũ> (bản sao)".' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class PreviewPlanGuideTemplateDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'vi' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({ enum: PLAN_GUIDE_VARIANT_VALUES, default: PLAN_GUIDE_VARIANT.WELCOME })
  @IsOptional()
  @IsIn(PLAN_GUIDE_VARIANT_VALUES)
  variant?: string;

  @ApiPropertyOptional({
    description:
      'Xem trước bản NHÁP chưa lưu của nội dung `variant` ở ngôn ngữ `locale`: gửi thân/tiêu đề đang soạn thay cho bản trong DB (không ghi gì).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PLAN_GUIDE_TEMPLATE_SUBJECT_MAX)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(PLAN_GUIDE_TEMPLATE_BODY_MAX)
  body?: string;
}

export class PlanGuideTemplatePreviewDto {
  @ApiProperty() subject!: string;
  @ApiProperty({ description: 'HTML đã dựng bằng dữ liệu mẫu (gói thật, người nhận giả).' })
  html!: string;
  @ApiProperty() text!: string;
}

export class SendTestPlanGuideTemplateDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'vi' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({ enum: PLAN_GUIDE_VARIANT_VALUES, default: PLAN_GUIDE_VARIANT.WELCOME })
  @IsOptional()
  @IsIn(PLAN_GUIDE_VARIANT_VALUES)
  variant?: string;
}

export class SendTestResultDto {
  @ApiProperty({ example: 'admin@xeprime.vn', description: 'Email của CHÍNH admin — không nhận địa chỉ từ client.' })
  to!: string;
  @ApiProperty({ example: '01J8XK2M5N7P9Q1R3S5T7V9W1X', description: 'Dòng `email_outbox` vừa xếp hàng.' })
  outboxId!: string;
}
