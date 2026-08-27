import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPROVAL_STATUS_VALUES,
  normalizeVnPhone,
  TENANT_STATUS_VALUES,
  TENANT_TYPE,
  TENANT_TYPE_VALUES,
} from '@xeprime/types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowered = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * SĐT về DẠNG LƯU `84xxxxxxxxx` ngay tại biên, bằng đúng hàm mà `users.phone` và sổ khách dùng
 * (`@xeprime/types`). Nhận vào `09…`/`+84…`/`84…` — ba cách gõ của cùng một số — và lưu một
 * dạng duy nhất, nếu không thì cùng một chủ shop tra ra hai kết quả khác nhau tuỳ hôm đó gõ kiểu gì.
 */
const vnPhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? normalizeVnPhone(value) : value;

/** Dạng ĐÃ chuẩn hoá — validator chạy SAU `@Transform`, nên nó soi `84…` chứ không phải `09…`. */
const STORED_VN_PHONE = /^84\d{9}$/;

/** Đăng ký gian hàng: tối thiểu tên. `status`/`tenant_id` KHÔNG nhận từ client (CLAUDE.md mục 5). */
export class RegisterShopDto {
  @ApiProperty({ example: 'Cho thuê xe Bình Minh' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 255)
  name!: string;

  /**
   * BẮT BUỘC từ wave chi nhánh: gian hàng phải biết mình ở đâu ngay khi mở, vì chi nhánh mặc
   * định tạo cùng lúc và nó là nguồn vị trí công khai của mọi xe sau này.
   *
   * Chỉ nhận MÃ. `provinceName` do server tra ra — client gửi tên lên là dữ liệu không kiểm soát
   * được (đúng thứ kiến trúc này thay thế).
   */
  @ApiProperty({ example: '48', description: 'Mã tỉnh/thành 2 ký tự (GET /provinces)' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  provinceCode!: string;

  @ApiPropertyOptional({ description: 'Địa chỉ chi nhánh đầu tiên' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ enum: TENANT_TYPE_VALUES, default: TENANT_TYPE.INDIVIDUAL })
  @IsOptional()
  @IsIn(TENANT_TYPE_VALUES)
  tenantType?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(lowered)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;
}

/** Cập nhật hồ sơ gian hàng — mọi trường tuỳ chọn, gửi cái nào cập nhật cái đó. */
export class UpdateTenantProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /**
   * Tỉnh/thành của gian hàng = tỉnh của CHI NHÁNH MẶC ĐỊNH, nên gửi mã lên đây là yêu cầu ĐỔI
   * chi nhánh đó — service chuyển tiếp cho `BranchesService` (writer duy nhất) chứ không tự ghi
   * hai cột sao chép trên `tenant_profiles`.
   *
   * `provinceName` KHÔNG còn nhận từ client: tên do server tra từ mã. Client gửi tên lên là dữ
   * liệu không kiểm soát được, và trước đây nó ghi đè bản sao rồi lệch hẳn với `provinceCode`.
   */
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành 2 ký tự (GET /provinces)' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  provinceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessLicenseNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qrUrl?: string;

  // ── Chủ gian hàng (nội bộ, không công khai) ────────────────────────────────
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  ownerFullName?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Nhận 09…/84…/+84…, lưu 84…' })
  @IsOptional()
  @Transform(vnPhone)
  // Chuỗi rỗng = XOÁ số đang lưu, nên nó phải đi qua được vòng validate.
  @ValidateIf((_, value) => value !== '')
  @Matches(STORED_VN_PHONE, { message: 'Số điện thoại không hợp lệ' })
  ownerPhone?: string;

  @ApiPropertyOptional({ example: 'chugianhang@xeprime.vn' })
  @IsOptional()
  @Transform(lowered)
  @ValidateIf((_, value) => value !== '')
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  ownerEmail?: string;
}

export class TenantProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true }) displayName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessLicenseNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) qrUrl!: string | null;

  /** Chủ gian hàng — chỉ trả về ở endpoint CỦA TÔI; trang gian hàng công khai không có khối này. */
  @ApiPropertyOptional({ type: String, nullable: true }) ownerFullName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Dạng lưu 84…' })
  ownerPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerEmail!: string | null;
}

/** Tóm tắt lần gửi duyệt gần nhất — để shop thấy lý do bị từ chối/bổ sung. */
export class LatestApprovalDto {
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!: string | null;
}

/** Chi nhánh mặc định — trả kèm ngay sau đăng ký để FE biết xe mới sẽ nằm ở đâu. */
export class DefaultBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
}

/** Gian hàng của tôi: thông tin tenant + hồ sơ + trạng thái duyệt gần nhất. */
export class MyShopDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TENANT_TYPE_VALUES }) tenantType!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: TenantProfileDto }) profile!: TenantProfileDto;
  @ApiPropertyOptional({ type: LatestApprovalDto, nullable: true })
  latestApproval!: LatestApprovalDto | null;
  /** Chi nhánh mặc định. `null` chỉ xảy ra với dữ liệu cũ chưa qua migration chi nhánh. */
  @ApiPropertyOptional({ type: DefaultBranchDto, nullable: true })
  defaultBranch!: DefaultBranchDto | null;
}
