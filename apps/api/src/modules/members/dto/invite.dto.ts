import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INVITE_STATUS_VALUES, TENANT_ROLE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as INVITE_DEFAULT_LIMIT, MAX_LIMIT as INVITE_MAX_LIMIT };

export class CreateInviteDto {
  @ApiProperty({
    example: 'nhanvien@congty.vn',
    description:
      'Email nhận thư mời. Người nhận KHÔNG cần có sẵn tài khoản — họ đăng ký rồi bấm lại link.',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    enum: TENANT_ROLE_VALUES,
    description:
      'Không nhận `shop_owner` — chủ gian hàng là người tạo gian hàng, không mời được. ' +
      'Giá trị đó nằm trong enum nhưng bị `InvitesService.create` từ chối bằng `VALIDATION_FAILED`.',
  })
  // `TENANT_ROLE_VALUES` trọn vẹn, KHÔNG lọc bớt `shop_owner`: enum ở đây là danh sách vai trò
  // hợp lệ của gian hàng, và cắt nó đi làm tài liệu Swagger mô tả sai tập vai trò đang tồn tại.
  // Việc cấm mời chủ gian hàng là LUẬT NGHIỆP VỤ nên nó nằm ở service, cùng chỗ với các luật
  // còn lại của lời mời (đã là thành viên, đã có lời mời đang chờ).
  @IsIn(TENANT_ROLE_VALUES)
  roleKey!: string;
}

export class InviteListQueryDto {
  @ApiPropertyOptional({
    enum: INVITE_STATUS_VALUES,
    description: 'Bỏ trống = chỉ lời mời ĐANG CHỜ. Danh sách mặc định là việc cần theo dõi.',
  })
  @IsOptional()
  @IsIn(INVITE_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/**
 * Một lời mời, nhìn từ PHÍA GIAN HÀNG.
 *
 * KHÔNG có `token` và cũng không có gì suy ra được token: nó chỉ tồn tại trong đúng một email.
 * Trả token về đây nghĩa là ai xem được danh sách nhân sự cũng tự nhận được mọi lời mời đang chờ.
 */
export class InviteDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: INVITE_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) expiresAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên người gửi lời mời' })
  createdByName!: string | null;
}

/**
 * Kết quả TẠO một lời mời — có thêm `emailSent`, và chỉ ở đây.
 *
 * Tách khỏi `InviteDto` vì nó là kết quả của MỘT lần gửi, không phải thuộc tính của lời mời:
 * đọc lại danh sách ngày hôm sau thì "lần gửi đó có thành công không" đã là chuyện quá khứ, và
 * một cột luôn `true` trong bảng chỉ tạo cảm giác an toàn giả.
 */
export class CreateInviteResultDto extends InviteDto {
  @ApiProperty({
    description:
      'false khi lời mời ĐÃ được tạo nhưng thư không gửi được (SMTP hỏng). Giao diện phải nói rõ để người gửi bấm Gửi lại — không được coi như đã gửi.',
  })
  emailSent!: boolean;
}

export class InvitePageDto {
  @ApiProperty({ type: [InviteDto] }) data!: InviteDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Một lời mời, nhìn từ PHÍA NGƯỜI ĐƯỢC MỜI — trước khi họ quyết định.
 *
 * Endpoint đọc nó KHÔNG cần đăng nhập: người được mời thường chưa có tài khoản, và bắt họ đăng
 * ký trước khi cho biết ai mời và mời làm gì là bắt ký vào một tờ giấy trắng.
 *
 * Vì vậy nội dung ở đây bị giới hạn ở mức đủ để quyết định: tên gian hàng, vai trò, hạn. Email
 * được mời trả về dạng ĐÃ CHE — người cầm link không nhất thiết là người được mời.
 */
export class InvitePreviewDto {
  @ApiProperty({ enum: INVITE_STATUS_VALUES, description: '`pending` mới trả lời được' })
  status!: string;
  @ApiProperty({ description: 'Tên gian hàng mời' }) tenantName!: string;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) invitedByName!: string | null;
  @ApiProperty({ description: 'Email được mời, ĐÃ che bớt' }) invitedEmailMasked!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) expiresAt!: string;
}

/** Kết quả sau khi người được mời trả lời. */
export class InviteAnswerDto {
  @ApiProperty({ enum: INVITE_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Slug gian hàng vừa vào — `null` khi từ chối. FE dùng để điều hướng.',
  })
  tenantSlug!: string | null;
}
