import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INVITE_STATUS_VALUES, TENANT_ROLE_VALUES, VN_PHONE_PATTERN } from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { MemberBranchScopeDto } from './member.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as INVITE_DEFAULT_LIMIT, MAX_LIMIT as INVITE_MAX_LIMIT };

export class CreateInviteDto extends MemberBranchScopeDto {
  /**
   * SỐ ĐIỆN THOẠI của người được mời (ADR 0060) — định danh đăng nhập của site partner. Người nhận
   * KHÔNG cần có sẵn tài khoản: họ mở link, đăng ký (SĐT qua OTP) hoặc đăng nhập, rồi nhận lời mời.
   */
  @ApiProperty({
    example: '0901234567',
    description:
      'SĐT người được mời. Chỉ tài khoản đối tác có ĐÚNG số này (đã xác minh) mới nhận được lời mời.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

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
 * KHÔNG có `token` và cũng không có gì suy ra được token: link chỉ xuất hiện MỘT lần, trong phản
 * hồi tạo lời mời (`CreateInviteResultDto.inviteUrl`). Trả token về đây nghĩa là ai xem được danh
 * sách nhân sự cũng tự nhận được mọi lời mời đang chờ.
 */
export class InviteDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SĐT được mời, dạng nội địa 0xxxxxxxxx (ADR 0060). null với lời mời email cũ.',
  })
  phone!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Email được mời — CHỈ lời mời tạo trước ADR 0060; lời mời mới luôn null.',
  })
  email!: string | null;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: INVITE_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) expiresAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên người gửi lời mời' })
  createdByName!: string | null;
}

/**
 * Kết quả TẠO một lời mời — có thêm `inviteUrl`, và CHỈ ở đây (ADR 0060).
 *
 * Tài khoản đối tác không bắt buộc có email, nên lời mời không còn đi bằng thư: người mời sao chép
 * link và tự gửi cho nhân viên (Zalo, tin nhắn). Link chỉ xuất hiện đúng một lần — mất thì "Gửi
 * lại" tạo link mới và thu hồi link cũ. Lộ link cũng không sao: chỉ tài khoản có ĐÚNG số được mời
 * (đã xác minh) mới nhận được.
 */
export class CreateInviteResultDto extends InviteDto {
  @ApiProperty({
    description:
      'Link nhận lời mời trên site partner — chỉ trả về ở đây, một lần. Người mời tự gửi cho người được mời.',
  })
  inviteUrl!: string;
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
 * Vì vậy nội dung ở đây bị giới hạn ở mức đủ để quyết định: tên gian hàng, vai trò, hạn. SĐT
 * (hoặc email của lời mời cũ) được mời trả về dạng ĐÃ CHE — người cầm link không nhất thiết là
 * người được mời.
 */
export class InvitePreviewDto {
  @ApiProperty({ enum: INVITE_STATUS_VALUES, description: '`pending` mới trả lời được' })
  status!: string;
  @ApiProperty({ description: 'Tên gian hàng mời' }) tenantName!: string;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) invitedByName!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SĐT được mời, ĐÃ che bớt (ADR 0060). null với lời mời email cũ.',
  })
  invitedPhoneMasked!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Email được mời, ĐÃ che bớt — chỉ lời mời tạo trước ADR 0060.',
  })
  invitedEmailMasked!: string | null;
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
