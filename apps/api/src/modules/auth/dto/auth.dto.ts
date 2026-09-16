import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { FEATURE_STATE_VALUES, PLAN_FEATURE_VALUES, VN_PHONE_PATTERN } from '@xeprime/types';
import { IsLoginIdentifier } from '../../../common/login-identifier';

const PASSWORD_MIN = 8;

/** Mật khẩu: ≥8 ký tự, có cả chữ và số — khớp yup `passwordSchema` ở @xeprime/validators. */
class PasswordField {
  @ApiProperty({ minLength: PASSWORD_MIN, example: 'matkhau123' })
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự` })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu cần có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu cần có số' })
  password!: string;
}

export class RegisterDto extends PasswordField {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'Vui lòng nhập họ tên' })
  @MaxLength(255)
  displayName!: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'Email, hoặc SĐT Việt Nam dạng 0xxxxxxxxx / +84xxxxxxxxx',
    example: 'ban@congty.vn',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập email hoặc số điện thoại' })
  @IsLoginIdentifier()
  identifier!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu' })
  password!: string;
}

/** Đặt mật khẩu cho tài khoản CHƯA có mật khẩu (vd tạo bằng SĐT/OTP). Cần đăng nhập. */
export class SetPasswordDto extends PasswordField {}

/**
 * Đổi mật khẩu khi ĐÃ đăng nhập — cần mật khẩu hiện tại làm bằng chứng.
 *
 * Không kế thừa `PasswordField` vì trường mới tên `newPassword`: hai ô cùng tên `password` trên
 * một form là chỗ để autofill của trình duyệt điền nhầm ô cũ vào ô mới.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Mật khẩu đang dùng' })
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu hiện tại' })
  currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN, example: 'matkhaumoi456' })
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự` })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu cần có chữ' })
  @Matches(/d/, { message: 'Mật khẩu cần có số' })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ban@congty.vn' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class ResetPasswordDto extends PasswordField {
  @ApiProperty({ description: 'Token từ link trong email' })
  @IsString()
  @MinLength(1)
  token!: string;
}

/**
 * Trạng thái MỘT tính năng nâng cao với gian hàng đang đăng nhập (ADR 0027 điều 3).
 *
 * Mảng cặp `{feature, state}` chứ không phải object khoá cố định: cờ là snake_case, và thêm cờ
 * thứ 9 không nên buộc phải sửa class DTO.
 */
export class TenantFeatureStateDto {
  @ApiProperty({ enum: PLAN_FEATURE_VALUES }) feature!: string;
  @ApiProperty({ enum: FEATURE_STATE_VALUES }) state!: string;
}

export class CurrentTenantSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Xem TenantStatus trong @xeprime/types' }) status!: string;

  /**
   * TRỤC ĐĂNG KÝ — `commission` · `package_pending` · `package_active` (ADR 0040).
   *
   * Thứ QUYẾT ĐỊNH KHU LÀM VIỆC, và nó được đọc TRƯỚC `billingMode`:
   *
   *  - `package_pending` ⇒ gian hàng trả phí chưa thanh toán. `billingMode` của họ là `null`
   *    (cố ý không gán gói hoa hồng tạm), nên mọi phép suy chỉ dựa vào `billingMode` xếp họ
   *    cùng rổ với một tenant có danh mục gói hỏng — và đẩy họ vào Owner Lite. Đích đúng là màn
   *    onboarding, bước chọn gói/thanh toán.
   *  - `package_active` ⇒ đã trả tiền ít nhất một lần. Gói hết hạn thì `billingMode` về
   *    `commission` nhưng cột này KHÔNG lùi, nên web biết không được mời họ vào wizard "đăng ký
   *    chủ xe lần đầu" — họ là khách cũ cần gia hạn.
   *
   * Độc lập với `status` (khoá/mở của nền tảng) và với trục xác minh pháp nhân.
   */
  @ApiProperty({ description: 'Xem ShopOnboardingState trong @xeprime/types' })
  onboardingState!: string;

  @ApiProperty({ description: 'Xem TenantRole trong @xeprime/types' }) roleKey!: string;

  /**
   * LOGO gian hàng — hình đại diện DUY NHẤT của cổng quản lý (16/09/2026).
   *
   * Đi cùng `/auth/me` chứ không đợi `GET /tenants/current/shop`: vỏ portal vẽ nó ở LẦN RENDER
   * ĐẦU của mọi trang, và một truy vấn thứ hai chỉ để lấy một tấm ảnh nghĩa là avatar nhấp nháy
   * sau mỗi lần chuyển trang — cùng lý do `features` đi kèm ở đây.
   *
   * `null` ⇒ vỏ dựng chữ cái đầu của TÊN GIAN HÀNG. KHÔNG rơi về `users.avatarUrl`: trong
   * Manage, danh tính nổi bật là của gian hàng, không phải của người đang đăng nhập.
   */
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Logo gian hàng; null = dùng chữ cái đầu',
  })
  logoUrl!: string | null;

  /**
   * LUÔN đủ 8 cờ, kể cả `hidden` — vắng mặt ≠ hidden: client phải phân biệt được "cờ này ẩn"
   * với "backend cũ chưa biết cờ này" (ADR 0027 điều 3).
   */
  @ApiProperty({ type: [TenantFeatureStateDto] })
  features!: TenantFeatureStateDto[];

  @ApiProperty({ type: String, nullable: true, description: 'Mã gói hiện hành; null = không có' })
  planCode!: string | null;

  /**
   * TÊN hiển thị của gói hiện hành — nhãn tài khoản in thẳng nó ("Chủ gian hàng · Gói theo xe").
   *
   * Đi trên dây thay vì để web tra một bảng `planCode → nhãn`: tên gói là DỮ LIỆU admin sửa
   * được ở màn quản trị (ADR 0029 điều 3), nên một bảng tra ở client sẽ nói sai kể từ lần đổi
   * tên đầu tiên, và nói sai đúng ở chỗ người dùng dùng để nhận ra mình đang trả tiền cho gì.
   */
  @ApiProperty({ type: String, nullable: true, description: 'Tên gói hiện hành; null = không có' })
  planName!: string | null;

  /**
   * % PHÍ DỊCH VỤ đang thật sự thu trên mỗi chuyến của tenant này — `null` khi tenant không ở
   * tuyến hoa hồng (tuyến gói luôn 0đ/chuyến) hoặc chưa có chính sách phí nào hiệu lực.
   *
   * ⚠️ Nguồn là `fee_policies.service_fee_percent` bản `active`, **không** phải
   * `tenant_subscriptions.commission_percent`. Hai số đó là hai thứ khác nhau và không có ràng
   * buộc nào giữ chúng khớp: dòng thuê bao chụp lại % của BẬC GÓI lúc gán, còn tiền thì
   * `computeCustomerFees` nhân từ chính sách phí (ADR 0029 điều 2). Nhãn tài khoản đọc số NÀY,
   * vì một nhãn nói "Hoa hồng 10%" trong khi khách bị thu 12% là một lời hứa sai về tiền.
   *
   * `null` ⇒ nhãn rút gọn còn "Chủ xe cá nhân", không bịa số.
   */
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '% phí dịch vụ đang thu trên chuyến (từ chính sách phí hiệu lực); null = không áp',
  })
  serviceFeePercent!: number | null;

  /**
   * Chế độ thu phí của gói HIỆN HÀNH — `commission` (Basic Owner) hay `package` (gian hàng
   * thuê bao). Xem `BillingMode` trong @xeprime/types.
   *
   * Đây là thứ phân biệt HAI TUYẾN của ADR 0028, và nó phải đi trên dây vì web dùng nó để chọn
   * khu làm việc. Suy từ `planCode == null` là SAI: `assignDefaultPlanWithinTx` gán cho mọi gian
   * hàng mới một gói tuyến hoa hồng, nên `planCode` gần như không bao giờ rỗng.
   */
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Xem BillingMode trong @xeprime/types',
  })
  billingMode!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — băng hết hạn đọc ngày này',
  })
  planEndsAt!: string | null;

  /**
   * Tenant đang ở đâu trong vòng đời gói — `current` · `grace` · `lapsed` · `unconfigured`
   * (xem `BillingPhase` trong @xeprime/types).
   *
   * Cần đi trên dây vì `planEndsAt` một mình không phân biệt được "vừa hết hạn, còn ân hạn" với
   * "hết hẳn": hai trạng thái đó có cùng `planEndsAt` trong quá khứ nhưng khác nhau ở toàn bộ
   * quyền dùng Manage. Trước 15/09/2026 web tự suy bằng cách so `planEndsAt` với đồng hồ MÁY
   * KHÁCH — sai ngay khi máy khách lệch giờ, và không biết `graceDays` của gói là bao nhiêu.
   */
  @ApiProperty({ description: 'Xem BillingPhase trong @xeprime/types' })
  billingPhase!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — hết ân hạn; null khi gói còn hạn hoặc chưa có gói',
  })
  graceEndsAt!: string | null;

  /**
   * Số xe ĐANG bán trên chợ (`approved_public`) — mốc phân biệt "đang đăng ký" với "chủ xe"
   * (`resolveOwnerStage` ở `@xeprime/types`).
   *
   * Trả kèm `MeDto` chứ không để web tự đếm bằng một lần gọi `/vehicles`: menu đọc nó ở LẦN VẼ
   * ĐẦU, và một request thứ hai nghĩa là menu nhấp nháy từ "đang đăng ký" sang "chủ xe" mỗi lần
   * tải trang. Cùng lý do với `features` ngay trên.
   */
  @ApiProperty({ description: 'Số xe đang công khai trên marketplace' })
  publicVehicleCount!: number;
}

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  // Các field dưới LUÔN có mặt trong response, chỉ có thể mang giá trị null → `@ApiProperty`
  // + `nullable`, KHÔNG phải `@ApiPropertyOptional` (optional nghĩa là "có thể vắng mặt", và
  // nó khiến frontend phải xử lý thêm nhánh `undefined` không bao giờ xảy ra).
  // `type: String` cũng bắt buộc: thiếu nó openapi-typescript sinh ra `Record<string, never>`.
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SĐT của chính tài khoản, dạng nội địa `0xxxxxxxxx` — để điền sẵn ô liên hệ',
  })
  phone!: string | null;

  @ApiProperty({ description: 'Đã xác thực SĐT chưa — gate cho việc đặt xe/mở shop' })
  phoneVerified!: boolean;

  @ApiProperty({
    description: 'Đã có mật khẩu chưa — false với tài khoản tạo bằng SĐT/OTP (gợi ý đặt mật khẩu)',
  })
  hasPassword!: boolean;

  @ApiProperty({ type: CurrentTenantSummaryDto, nullable: true })
  tenant!: CurrentTenantSummaryDto | null;

  /**
   * Số chuyến ĐI THUÊ của chính người này còn CHƯA KHÉP (cùng vị từ với tab "đang diễn ra"
   * của `/trips`).
   *
   * Khu `/account` của một tài khoản gian hàng ẩn menu Chuyến — nhưng không được giấu một chuyến
   * đang chạy của chính họ. Ca thật: chủ xe tuyến hoa hồng đang đi thuê xe người khác thì nâng
   * lên gói; chuyến chưa xong, tiền hoàn chưa về, chat với chủ xe kia vẫn mở.
   *
   * Trả kèm `MeDto` để menu vẽ đúng ngay LẦN ĐẦU — cùng lý do với `tenant.publicVehicleCount`.
   */
  @ApiProperty({ description: 'Số chuyến đi thuê chưa khép của chính người dùng' })
  openRenterTripCount!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Xem PlatformRole trong @xeprime/types',
  })
  platformRole!: string | null;

  @ApiProperty({ isArray: true, type: String })
  permissions!: string[];
}
