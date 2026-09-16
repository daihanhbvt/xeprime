import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADDRESS_LINE_MAX_LENGTH,
  APPROVAL_STATUS_VALUES,
  LOCATION_SOURCE_VALUES,
  REGISTRATION_TRACK,
  REGISTRATION_TRACK_VALUES,
  SHOP_ONBOARDING_STATE_VALUES,
  SHOP_VERIFICATION_VALUES,
  TENANT_STATUS_VALUES,
  TENANT_TYPE,
  TENANT_TYPE_VALUES,
} from '@xeprime/types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lowered = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

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

  @ApiPropertyOptional({
    example: '00004',
    description: 'Mã xã/phường/đặc khu 5 chữ số (GET /provinces/:code/wards)',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(5, 5)
  wardCode?: string;

  @ApiPropertyOptional({
    example: '12 Nguyễn Thái Học',
    description: 'Số nhà, đường, toà nhà. Server ghép chuỗi hiển thị từ đây + xã/phường + tỉnh.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  addressLine?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google khi chọn từ gợi ý' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  placeId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ ghim đã xác nhận — thắng toạ độ server tự tra' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ enum: LOCATION_SOURCE_VALUES })
  @IsOptional()
  @IsIn(LOCATION_SOURCE_VALUES)
  locationSource?: string;

  /**
   * @deprecated Dùng `addressLine`. Giữ lại vì `ValidationPipe` chạy `forbidNonWhitelisted`:
   * bỏ hẳn khiến mọi bản client đang chạy nhận 400 ngay lần đăng ký tiếp theo.
   */
  @ApiPropertyOptional({ deprecated: true, description: 'Cũ — dùng `addressLine`' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ enum: TENANT_TYPE_VALUES, default: TENANT_TYPE.INDIVIDUAL })
  @IsOptional()
  @IsIn(TENANT_TYPE_VALUES)
  tenantType?: string;

  /**
   * CỬA VÀO mà người đăng ký đã chọn (ADR 0040) — hợp đồng tường minh, không phải một suy luận.
   *
   * Đây là thứ phân biệt hai tuyến của ADR 0028 ở đúng thời điểm chúng tách nhau. Trước đợt này
   * không có tham số nào: hai điểm vào gọi cùng endpoint, server gán gói hoa hồng cho cả hai, và
   * người bấm "Đăng ký gian hàng" bị điều hướng vào màn của tuyến kia. Mọi cách phân biệt ở
   * client (prop component, `?next=`, state router) đều chết sau một lần F5 — nên ý định phải đi
   * trên dây và được LƯU (`tenants.onboarding_state`).
   *
   * `commission` (mặc định): gán gói hoa hồng mặc định, vào Owner Lite ngay.
   * `package`: KHÔNG gán gói nào, tenant ở `package_pending` và chỉ vào được màn onboarding cho
   * tới khi hoá đơn gói `paid`. Kèm theo đó là bộ trường NGHIÊM hơn — xem
   * `missingPackageShopRegistrationFields`.
   *
   * Tuỳ chọn để client cũ (app native chưa có màn gian hàng) không vỡ: vắng mặt = tuyến hoa
   * hồng, đúng hành vi trước đây.
   *
   * ⚠️ KHÔNG khai `default:` trong `@ApiPropertyOptional`, dù giá trị mặc định có thật.
   * `openapi-typescript` v7 coi một property CÓ `default` là BẮT BUỘC trong type sinh ra, kể cả
   * khi nó không nằm trong `required` của schema — và với một thân REQUEST, đó là nói ngược hợp
   * đồng (client cũ không gửi trường này, và server có `@IsOptional()`). Mặc định vì vậy nằm ở
   * `description` + `registrationTrackOf` phía server.
   */
  @ApiPropertyOptional({
    enum: REGISTRATION_TRACK_VALUES,
    description: `Cửa vào: \`commission\` (Owner Lite) hoặc \`package\` (gian hàng trả phí). Vắng mặt = \`${REGISTRATION_TRACK.COMMISSION}\`.`,
  })
  @IsOptional()
  @IsIn(REGISTRATION_TRACK_VALUES)
  registrationTrack?: string;

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

  /*
   * KHÔNG có `ownerFullName` (16/09/2026). Người gọi `POST /tenants` LÀ chủ gian hàng — server
   * gắn `tenants.owner_user_id` bằng chính session của họ — nên họ tên chủ đã nằm ở
   * `users.display_name` và hỏi lại là mời gõ một cái tên thứ hai không ai đối chiếu.
   */
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

  /** @deprecated Dùng `addressLine` — xem ghi chú ở `RegisterShopDto.address`. */
  @ApiPropertyOptional({ deprecated: true, description: 'Cũ — dùng `addressLine`' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Số nhà, đường, toà nhà của chi nhánh mặc định' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  addressLine?: string;

  /**
   * Địa chỉ của gian hàng = địa chỉ của CHI NHÁNH MẶC ĐỊNH, nên gửi mã lên đây là yêu cầu ĐỔI
   * chi nhánh đó — service chuyển tiếp cho `BranchesService` (writer duy nhất) chứ không tự ghi
   * bốn cột sao chép trên `tenant_profiles`.
   *
   * `provinceName`/`wardName` KHÔNG nhận từ client: tên do server tra từ mã. Client gửi tên lên
   * là dữ liệu không kiểm soát được, và trước đây nó ghi đè bản sao rồi lệch hẳn với mã.
   */
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành 2 ký tự (GET /provinces)' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã xã/phường/đặc khu 5 chữ số' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(5, 5)
  wardCode?: string;

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

  /*
   * ⚠️ KHÔNG nhận lại bốn ô NGÂN HÀNG và ba ô CHỦ GIAN HÀNG ở đây (16/09/2026).
   *
   * Tài khoản nhận tiền đi qua `/shop/bank-accounts` — sổ có cờ mặc định, lưu trữ và dấu vết
   * đổi, và là bảng mà mọi lệnh chi thật đọc. Bốn ô text cũ ghi vào chỗ không đồng tiền nào
   * chạy tới.
   *
   * Chủ gian hàng đi qua tài khoản của chính họ: tên ở `PATCH /users/me`, email/SĐT ở luồng
   * xác minh OTP (`/users/me/contact`). Nhận chúng ở endpoint tenant nghĩa là cho một
   * `shop_manager` có `tenant.update` sửa danh tính của người CHỦ — đúng thứ ADR 0038 điều 3
   * tách ra.
   */
}

export class TenantProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true }) displayName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Địa chỉ HIỂN THỊ đã ghép — bản sao của chi nhánh mặc định',
  })
  address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) wardCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) wardName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessLicenseNo!: string | null;
}

/**
 * CHỦ GIAN HÀNG — đọc từ `tenants.owner_user_id → users`, nguồn DUY NHẤT (16/09/2026).
 *
 * Không phải một bản sao trên hồ sơ: đây chính là tài khoản đăng nhập của người sở hữu, nên
 * email/SĐT ở đây là thứ đã (hoặc chưa) đi qua xác minh OTP — và hai cờ dưới nói ra điều đó.
 * Một màn hình khoe "đã xác minh" mà không có cờ thật là một lời hứa không ai đứng sau.
 *
 * CHỈ CÓ ở endpoint "gian hàng của tôi". Trang gian hàng công khai không bao giờ mang khối này
 * (ADR 0008) — nó là dữ liệu liên hệ của một con người, không phải mặt tiền của cửa hàng.
 */
export class ShopOwnerAccountDto {
  @ApiProperty({ description: 'Id user chủ gian hàng' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Dạng lưu 84…' })
  phone!: string | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() phoneVerified!: boolean;
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
  @ApiPropertyOptional({ type: String, nullable: true }) wardCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) wardName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Địa chỉ hiển thị đã ghép của chi nhánh mặc định',
  })
  address!: string | null;
  @ApiProperty({ description: 'Địa chỉ chưa khớp danh mục hành chính hiện hành — cần bổ sung' })
  needsLocationReview!: boolean;
}

/** Gian hàng của tôi: thông tin tenant + hồ sơ + trạng thái duyệt gần nhất. */
export class MyShopDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TENANT_TYPE_VALUES }) tenantType!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  /**
   * Trục XÁC MINH — độc lập với `status` (ADR 0036).
   *
   * `status` trả lời "gian hàng còn được hoạt động không" (khoá/mở khoá của nền tảng);
   * trường này trả lời "nền tảng đã xem xét pháp nhân chưa" và là điều kiện để MUA GÓI thuê
   * bao. Đăng xe lên chợ KHÔNG đọc trường này — tuyến hoa hồng chỉ có cổng duyệt XE.
   */
  @ApiProperty({ enum: SHOP_VERIFICATION_VALUES }) verification!: string;
  /**
   * Trục ĐĂNG KÝ — `commission` · `package_pending` · `package_active` (ADR 0040).
   *
   * Trang Cửa hàng đọc nó để biết luật nào áp cho gian hàng này: cổng logo trước khi gửi xe
   * duyệt chỉ áp với tuyến gói, và băng chào mừng sau lần thanh toán đầu chỉ có nghĩa với
   * `package_active`. Suy từ `billingMode` là SAI ở cả hai đầu — một gian hàng hết gói vẫn là
   * gian hàng, còn một chủ xe hoa hồng vừa mua gói thì chưa từng đi qua cửa gian hàng.
   */
  @ApiProperty({ enum: SHOP_ONBOARDING_STATE_VALUES }) onboardingState!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: TenantProfileDto }) profile!: TenantProfileDto;
  /**
   * Tài khoản CHỦ gian hàng — LUÔN có: `tenants.owner_user_id` là cột NOT NULL với khoá ngoại
   * tới `users`, nên không có gian hàng nào không có chủ.
   */
  @ApiProperty({ type: ShopOwnerAccountDto }) ownerAccount!: ShopOwnerAccountDto;
  @ApiPropertyOptional({ type: LatestApprovalDto, nullable: true })
  latestApproval!: LatestApprovalDto | null;
  /** Chi nhánh mặc định. `null` chỉ xảy ra với dữ liệu cũ chưa qua migration chi nhánh. */
  @ApiPropertyOptional({ type: DefaultBranchDto, nullable: true })
  defaultBranch!: DefaultBranchDto | null;
}
