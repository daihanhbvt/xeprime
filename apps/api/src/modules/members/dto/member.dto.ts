import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MEMBERSHIP_BRANCH_SCOPE_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  TENANT_ROLE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

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
}

export class MemberDto {
  @ApiProperty({ description: 'ID user — dùng cho PATCH/DELETE /members/:userId' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: MEMBERSHIP_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: MEMBERSHIP_BRANCH_SCOPE_VALUES }) branchScope!: string;
  @ApiProperty({
    type: [String],
    description: "Rỗng khi `branchScope = 'all'` — lúc đó thành viên thấy mọi chi nhánh",
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
