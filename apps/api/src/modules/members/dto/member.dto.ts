import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DISPLAY_NAME_POLICY,
  MEMBER_ROSTER_KIND_VALUES,
  MEMBER_ROSTER_STATUS_VALUES,
  MEMBERSHIP_BRANCH_SCOPE_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  STAFF_USERNAME_MAX,
  STAFF_USERNAME_MIN,
  STAFF_USERNAME_PATTERN,
  TENANT_ROLE_VALUES,
  VN_MOBILE_PHONE_PATTERN,
  normalizeDisplayName,
  normalizeStaffUsername,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { PhoneInput } from '../../../common/phone';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as MEMBER_DEFAULT_LIMIT, MAX_LIMIT as MEMBER_MAX_LIMIT };

export class MemberListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: TENANT_ROLE_VALUES })
  @IsOptional()
  @IsIn(TENANT_ROLE_VALUES)
  roleKey?: string;

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
 * Phạm vi chi nhánh của một thành viên — dùng chung cho lời mời và đổi vai (ADR 0052).
 *
 * Hai trường đi cùng nhau chứ không phải một mảng "rỗng nghĩa là tất cả": mảng rỗng đọc được
 * thành "không chi nhánh nào" lẫn "mọi chi nhánh", và hai điều đó ngược hẳn nhau về quyền.
 */
export class MemberBranchScopeDto {
  @ApiPropertyOptional({
    enum: MEMBERSHIP_BRANCH_SCOPE_VALUES,
    // KHÔNG khai `default`: openapi-typescript coi field có default là BẮT BUỘC ở type sinh ra,
    // trong khi vắng mặt ở đây mang nghĩa riêng — lời mời hiểu là 'all', PATCH hiểu là GIỮ NGUYÊN.
    description:
      "'all' = toàn gian hàng · 'limited' = chỉ các chi nhánh ở `branchIds` · " +
      'bỏ trống = giữ nguyên (PATCH) hoặc toàn gian hàng (lời mời)',
  })
  @IsOptional()
  @IsIn(MEMBERSHIP_BRANCH_SCOPE_VALUES)
  branchScope?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Bắt buộc và phải khác rỗng khi `branchScope = 'limited'`; bỏ qua khi 'all'",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(26, 26, { each: true })
  branchIds?: string[];
}

/** Tên gợi nhớ (ADR 0086) — chuỗi rỗng / `null` ở PATCH là GỠ, vắng mặt là giữ nguyên. */
export const MEMBER_NICKNAME_MAX = 60;

export class UpdateMemberRoleDto extends MemberBranchScopeDto {
  /**
   * Vắng mặt = GIỮ NGUYÊN vai trò — đối xứng với `branchScope` (xem `MembersService.updateRole`).
   *
   * Màn Nhân sự có hai ô độc lập trên cùng một dòng: vai trò và chi nhánh phụ trách. Nếu ô chi
   * nhánh buộc phải kèm `roleKey`, nó chỉ có một giá trị để gửi là vai trò đang NẰM TRONG CACHE —
   * và một lượt hạ vai vừa gửi đi, chưa refetch xong, sẽ bị lượt đổi chi nhánh ghi đè ngược lại.
   * Lệch đó âm thầm và đi theo chiều MỞ QUYỀN (về vai cũ, cao hơn), nên cú PATCH nào không có ý
   * đổi vai thì không gửi `roleKey`.
   */
  @ApiPropertyOptional({ enum: TENANT_ROLE_VALUES })
  @IsOptional()
  @IsIn(TENANT_ROLE_VALUES)
  roleKey?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MEMBER_NICKNAME_MAX,
    description: 'Tên gợi nhớ trong gian hàng. Vắng mặt = giữ nguyên; rỗng hoặc null = gỡ',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MEMBER_NICKNAME_MAX)
  nickname?: string | null;

  /** Họ tên — CHỈ tài khoản do gian hàng cấp (ADR 0087); tài khoản tự đăng ký do chính chủ đặt. */
  @ApiPropertyOptional({
    minLength: DISPLAY_NAME_POLICY.MIN_LENGTH,
    maxLength: DISPLAY_NAME_POLICY.MAX_LENGTH,
    description: 'Chỉ tài khoản do gian hàng cấp - còn lại trả `MEMBER_ACCOUNT_NOT_MANAGED`',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeDisplayName(value) : value))
  @MinLength(DISPLAY_NAME_POLICY.MIN_LENGTH)
  @MaxLength(DISPLAY_NAME_POLICY.MAX_LENGTH)
  @Matches(DISPLAY_NAME_POLICY.PATTERN, { message: 'Tên chỉ gồm chữ cái, chữ số và khoảng trắng' })
  displayName?: string;

  /** SĐT liên hệ (không xác minh, không đăng nhập). Rỗng / null = gỡ; vắng = giữ nguyên. */
  @ApiPropertyOptional({ type: String, nullable: true, example: '0901234567' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @PhoneInput()
  @Matches(VN_MOBILE_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  contactPhone?: string | null;
}

/** Mật khẩu: ≥8 ký tự, có cả chữ và số — cùng luật với đăng ký (`PasswordField` của auth). */
const PASSWORD_MIN = 8;

class MemberPasswordField {
  @ApiProperty({ minLength: PASSWORD_MIN, example: 'matkhau123' })
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự` })
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu cần có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu cần có số' })
  password!: string;
}

/**
 * Chủ gian hàng CẤP tài khoản cho nhân viên (ADR 0087): họ tên, tên đăng nhập, mật khẩu, vai, chi
 * nhánh. Không gửi gì cho ai — chủ tự trao tên đăng nhập + mật khẩu cho nhân viên.
 */
export class CreateMemberAccountDto extends MemberBranchScopeDto {
  @ApiProperty({
    example: 'Lê Thị Kim',
    minLength: DISPLAY_NAME_POLICY.MIN_LENGTH,
    maxLength: DISPLAY_NAME_POLICY.MAX_LENGTH,
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeDisplayName(value) : value))
  @MinLength(DISPLAY_NAME_POLICY.MIN_LENGTH)
  @MaxLength(DISPLAY_NAME_POLICY.MAX_LENGTH)
  @Matches(DISPLAY_NAME_POLICY.PATTERN, { message: 'Tên chỉ gồm chữ cái, chữ số và khoảng trắng' })
  displayName!: string;

  @ApiProperty({
    example: 'kim.le',
    minLength: STAFF_USERNAME_MIN,
    maxLength: STAFF_USERNAME_MAX,
    description:
      'Chữ thường, bắt đầu bằng chữ cái, a-z 0-9 . _ ; unique toàn site partner. Server tự hạ chữ thường.',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeStaffUsername(value) : value))
  @Matches(STAFF_USERNAME_PATTERN, { message: 'Tên đăng nhập không hợp lệ' })
  username!: string;

  @ApiProperty({ minLength: PASSWORD_MIN, example: 'matkhau123' })
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự` })
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu cần có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu cần có số' })
  password!: string;

  @ApiProperty({ enum: TENANT_ROLE_VALUES })
  @IsIn(TENANT_ROLE_VALUES)
  roleKey!: string;

  @ApiPropertyOptional({ type: String, example: '0901234567', description: 'SĐT liên hệ, tuỳ chọn' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @PhoneInput()
  @Matches(VN_MOBILE_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  contactPhone?: string;
}

/** Chủ đặt lại mật khẩu cho tài khoản do gian hàng cấp (ADR 0087). */
export class ResetMemberPasswordDto extends MemberPasswordField {}

export class MemberActivityQueryDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/** Một việc thành viên đã làm trong gian hàng — một dòng `audit_logs` của chính họ. */
export class MemberActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã hành động, vd `booking_request.approve`' }) action!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) targetType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) targetId!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class MemberDto {
  @ApiProperty({ description: 'ID user - dùng cho PATCH/DELETE /members/:userId' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: MEMBERSHIP_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: MEMBERSHIP_BRANCH_SCOPE_VALUES }) branchScope!: string;
  @ApiProperty({
    type: [String],
    description: "Rỗng khi `branchScope = 'all'` - lúc đó thành viên thấy mọi chi nhánh",
  })
  branchIds!: string[];
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  joinedAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class MemberPageDto {
  @ApiProperty({ type: [MemberDto] }) data!: MemberDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

// ── Danh sách nhân sự GỘP (ADR 0086 điều 5) ──────────────────────────────────

export class MemberRosterQueryDto extends MemberListQueryDto {
  @ApiPropertyOptional({
    enum: MEMBER_ROSTER_STATUS_VALUES,
    description: '`pending` = lời mời còn hạn chưa trả lời; bỏ trống = mọi dòng',
  })
  @IsOptional()
  @IsIn(MEMBER_ROSTER_STATUS_VALUES)
  status?: string;
}

/**
 * Một dòng của màn Nhân sự: thành viên (`kind = member`) hoặc lời mời còn chờ (`kind = invite`).
 *
 * `id` là khoá thao tác của dòng: `userId` với thành viên (PATCH/DELETE `/members/:userId`), id lời
 * mời với lời mời (`/members/invites/:id/revoke`). Lời mời không có tài khoản nên `displayName` là
 * tên gợi nhớ người mời đặt, hoặc null.
 */
export class MemberRosterItemDto {
  @ApiProperty({ enum: MEMBER_ROSTER_KIND_VALUES }) kind!: string;
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) userId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên tài khoản' })
  displayName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên gợi nhớ trong gian hàng' })
  nickname!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'SĐT tài khoản (đã xác minh) hoặc SĐT liên hệ chủ ghi - dạng nội địa `0…`',
  })
  phone!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên đăng nhập - chỉ tài khoản do gian hàng cấp (ADR 0087)',
  })
  username!: string | null;
  @ApiProperty({ description: 'Tài khoản do gian hàng cấp: chủ đặt lại mật khẩu, sửa họ tên' })
  managedAccount!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'SĐT liên hệ chủ ghi' })
  contactPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: MEMBER_ROSTER_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Khác null = hệ thống khoá (vd `plan_lapsed`), không mở tay được',
  })
  lockedReason!: string | null;
  @ApiProperty({ enum: MEMBERSHIP_BRANCH_SCOPE_VALUES }) branchScope!: string;
  @ApiProperty({ type: [String] }) branchIds!: string[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mốc hoạt động cuối (phiên web, phiên app, đăng nhập) - ISO-8601 UTC',
  })
  lastActiveAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  joinedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lời mời: lúc gửi - ISO-8601 UTC' })
  invitedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Lời mời: hạn - ISO-8601 UTC' })
  expiresAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Người đã mời' })
  invitedByName!: string | null;
}

export class MemberRosterPageDto {
  @ApiProperty({ type: [MemberRosterItemDto] }) data!: MemberRosterItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Một vai của gian hàng cho ma trận "Vai trò & quyền" (ADR 0086 điều 1). */
export class MemberRoleSummaryDto {
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ description: 'Số thành viên đang giữ vai (đang hoạt động hoặc bị khoá)' })
  memberCount!: number;
  @ApiProperty({ type: [String], description: 'Khoá quyền của vai - đọc từ DB như guard' })
  permissions!: string[];
}
