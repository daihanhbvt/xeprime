/**
 * "Hồ sơ gian hàng đã đủ để gửi duyệt chưa" — MỘT định nghĩa cho cả hai phía.
 *
 * Trước đây câu hỏi này không có câu trả lời ở đâu cả: `submitForReview` chỉ kiểm TRẠNG THÁI
 * tenant, nên một hồ sơ trắng trơn vẫn vào được hàng đợi duyệt và reviewer nhận `{}` làm bằng
 * chứng. Còn phía web thì nút "Gửi duyệt" sáng ngay cả khi hai ô bắt buộc còn trống, vì
 * `shopProfileSchema` chỉ chạy lúc bấm **Lưu**.
 *
 * Quy tắc nằm ở `packages/types` chứ không ở một trong hai app, vì cả hai đều phải trả lời
 * GIỐNG HỆT nhau: web dùng nó để dựng checklist và chặn trước khi gọi API, api dùng nó làm
 * cổng thật. Chép sang hai nơi là hẹn ngày chúng lệch nhau, và lúc đó người dùng thấy checklist
 * xanh hết mà server vẫn từ chối.
 *
 * Hai nhóm, khác nhau ở hệ quả — không phải ở mức độ quan trọng:
 *
 * - **Bắt buộc** (`SHOP_PROFILE_REQUIREMENT`): thiếu thì reviewer không có gì để duyệt. Tên để
 *   hiện trên marketplace, tỉnh để biết xe nằm ở đâu, họ tên + SĐT để liên hệ được một người
 *   thật. Bốn thứ này CHẶN gửi duyệt.
 * - **Nên có** (`SHOP_PROFILE_SUGGESTION`): làm gian hàng bán được hàng hơn, nhưng thiếu vẫn
 *   duyệt được. Chúng hiện trong checklist để chủ shop biết còn gì, và KHÔNG chặn — mở gian
 *   hàng phải ít ma sát (mục tiêu G1 của brief 03).
 */

export const SHOP_PROFILE_REQUIREMENT = {
  DISPLAY_NAME: 'displayName',
  PROVINCE: 'province',
  OWNER_NAME: 'ownerName',
  OWNER_PHONE: 'ownerPhone',
} as const;

export type ShopProfileRequirement =
  (typeof SHOP_PROFILE_REQUIREMENT)[keyof typeof SHOP_PROFILE_REQUIREMENT];

export const SHOP_PROFILE_REQUIREMENT_VALUES = Object.values(
  SHOP_PROFILE_REQUIREMENT,
) as ShopProfileRequirement[];

export const SHOP_PROFILE_SUGGESTION = {
  LOGO: 'logo',
  BIO: 'bio',
  ADDRESS: 'address',
  COVER: 'cover',
} as const;

export type ShopProfileSuggestion =
  (typeof SHOP_PROFILE_SUGGESTION)[keyof typeof SHOP_PROFILE_SUGGESTION];

export const SHOP_PROFILE_SUGGESTION_VALUES = Object.values(
  SHOP_PROFILE_SUGGESTION,
) as ShopProfileSuggestion[];

/**
 * Giá trị cần để chấm hồ sơ.
 *
 * `provinceCode` là tỉnh HIỆU LỰC của gian hàng — tức tỉnh của chi nhánh mặc định, với hai cột
 * trên `tenant_profiles` chỉ là bản sao (xem `syncProfileFromDefaultBranch`). Người gọi tự phân
 * giải trước khi truyền vào; hàm này không biết gì về bảng nào.
 *
 * `ownerFullName`/`ownerPhone` đến từ TÀI KHOẢN CHỦ (`tenants.owner_user_id → users`), không
 * phải từ hồ sơ gian hàng: ba cột text cũ trên `tenant_profiles` đã bị gỡ 16/09/2026 vì chúng
 * là chữ gõ tay đứng cạnh một tài khoản đã xác minh nói khác đi. Hai khoá giữ NGUYÊN TÊN — mã
 * `ownerName`/`ownerPhone` đi trên dây trong `PROFILE_INCOMPLETE.details.missing`, và đổi tên
 * chúng là làm hỏng nhãn lỗi của mọi client đang chạy.
 */
export interface ShopProfileCompletenessInput {
  displayName?: string | null;
  provinceCode?: string | null;
  /** Tên hiển thị của user chủ gian hàng. */
  ownerFullName?: string | null;
  /** SĐT của user chủ gian hàng (dạng lưu `84…`). */
  ownerPhone?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  address?: string | null;
}

/**
 * `null`, `undefined` và `'   '` đều là "chưa có".
 *
 * Backend chuẩn hoá ô trống thành `NULL` khi ghi (`normalizeProfileWrite`), nhưng form phía web
 * cầm chuỗi rỗng cho tới lúc gửi — một hàm dùng chung phải đúng với cả hai dạng.
 */
function filled(value?: string | null): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Các mục BẮT BUỘC còn thiếu. Rỗng ⇒ gửi duyệt được. */
export function missingShopProfileRequirements(
  profile: ShopProfileCompletenessInput,
): ShopProfileRequirement[] {
  const missing: ShopProfileRequirement[] = [];
  if (!filled(profile.displayName)) missing.push(SHOP_PROFILE_REQUIREMENT.DISPLAY_NAME);
  if (!filled(profile.provinceCode)) missing.push(SHOP_PROFILE_REQUIREMENT.PROVINCE);
  if (!filled(profile.ownerFullName)) missing.push(SHOP_PROFILE_REQUIREMENT.OWNER_NAME);
  if (!filled(profile.ownerPhone)) missing.push(SHOP_PROFILE_REQUIREMENT.OWNER_PHONE);
  return missing;
}

/**
 * Các mục NÊN CÓ còn thiếu — chỉ để hiện trong checklist, không bao giờ chặn.
 *
 * KHÔNG còn mục "tài khoản nhận tiền" (16/09/2026): nó không sống trên hồ sơ gian hàng nữa mà ở
 * `bank_accounts` — một sổ riêng, có cờ mặc định và lưu trữ, với màn hình riêng trong trang Cửa
 * hàng. Chấm nó ở đây nghĩa là checklist phải đọc một bảng khác để trả lời, và lời hứa "hàm
 * thuần, không biết bảng nào" ở trên sẽ hết đúng.
 */
export function missingShopProfileSuggestions(
  profile: ShopProfileCompletenessInput,
): ShopProfileSuggestion[] {
  const missing: ShopProfileSuggestion[] = [];
  if (!filled(profile.logoUrl)) missing.push(SHOP_PROFILE_SUGGESTION.LOGO);
  if (!filled(profile.bio)) missing.push(SHOP_PROFILE_SUGGESTION.BIO);
  if (!filled(profile.address)) missing.push(SHOP_PROFILE_SUGGESTION.ADDRESS);
  if (!filled(profile.coverUrl)) missing.push(SHOP_PROFILE_SUGGESTION.COVER);
  return missing;
}

/** Hồ sơ đã đủ điều kiện gửi duyệt chưa. */
export function isShopProfileSubmittable(profile: ShopProfileCompletenessInput): boolean {
  return missingShopProfileRequirements(profile).length === 0;
}

/**
 * ── CỔNG ĐĂNG XE CỦA GIAN HÀNG TUYẾN GÓI (ADR 0040) ──────────────────────────────────────────
 *
 * Bộ quy tắc THỨ HAI trong file này, và nó cố ý KHÔNG dùng lại `SHOP_PROFILE_REQUIREMENT` ở
 * trên. Hai bộ trả lời hai câu hỏi khác nhau cho hai loại người khác nhau:
 *
 * | Bộ | Câu hỏi | Áp cho ai | Hệ quả khi thiếu |
 * | --- | --- | --- | --- |
 * | `SHOP_PROFILE_REQUIREMENT` | Reviewer có gì để XÁC MINH pháp nhân? | mọi tenant gửi xác minh | không gửi được phiếu `tenant` |
 * | `PACKAGE_SHOP_LISTING_REQUIREMENT` | Gian hàng trả phí đã đủ mặt tiền để BÁN chưa? | CHỈ gian hàng tuyến gói | không gửi được XE lên chợ |
 *
 * Gộp chúng lại là hỏng theo cả hai chiều:
 *
 *  - Bộ trên đòi `ownerName`/`ownerPhone` (danh tính của một CON NGƯỜI để reviewer gọi được) và
 *    coi `logo` là gợi ý. Đem nguyên nó ra gác việc đăng xe nghĩa là logo không bao giờ bị đòi,
 *    tức là cổng này không gác được thứ duy nhất nó sinh ra để gác.
 *  - Ngược lại, thêm `logo` vào bộ trên là chặn luôn chủ xe tuyến hoa hồng — một người có một
 *    chiếc xe không có logo gian hàng và không cần có, và bắt họ thiết kế một cái là dựng lại
 *    đúng rào cản mà ADR 0036 vừa gỡ.
 *
 * Trong luồng bình thường, bước "tạo gian hàng" của onboarding tuyến gói đã đòi đủ bốn mục đầu
 * (tên · SĐT liên hệ · tỉnh · địa chỉ chi tiết), nên mục thường còn thiếu sau khi thanh toán là
 * ĐÚNG MỘT mục: logo. Cổng vẫn chấm cả năm vì hồ sơ sửa được sau đó, và một gian hàng xoá trắng
 * tên rồi đăng xe là thứ không được lọt.
 *
 * Nguồn dữ liệu của từng mục là RÕ RÀNG và không đọc cột trùng lặp:
 *   `displayName`/`logoUrl` ← `tenant_profiles` · phần địa chỉ + SĐT ← CHI NHÁNH MẶC ĐỊNH
 *   (`tenant_branches`, nguồn sự thật vận hành — hai cột tỉnh trên hồ sơ chỉ là bản sao).
 */

export const PACKAGE_SHOP_LISTING_REQUIREMENT = {
  /** Tên hiển thị trên marketplace. */
  DISPLAY_NAME: 'displayName',
  /** SĐT liên hệ của gian hàng — khách gọi vào đây. Từ chi nhánh mặc định. */
  CONTACT_PHONE: 'contactPhone',
  PROVINCE: 'province',
  /**
   * Số nhà, đường — phần không danh mục nào phát hành, và từ ADR 0042 là phần ĐÃ ĐƯỢC BẢN ĐỒ
   * XÁC NHẬN (chọn từ gợi ý hoặc tự đặt ghim).
   *
   * Từng có một mục `ward` đứng cạnh đây. Nó bị bỏ cùng lúc với ô Xã/phường ở mọi form địa chỉ
   * có ghim: một cổng đòi thứ không màn hình nào còn hỏi là một cổng không ai qua được.
   */
  ADDRESS: 'address',
  /** Logo gian hàng: nhận diện trên chợ. CHỈ gian hàng tuyến gói bị đòi mục này. */
  LOGO: 'logo',
} as const;

export type PackageShopListingRequirement =
  (typeof PACKAGE_SHOP_LISTING_REQUIREMENT)[keyof typeof PACKAGE_SHOP_LISTING_REQUIREMENT];

export const PACKAGE_SHOP_LISTING_REQUIREMENT_VALUES = Object.values(
  PACKAGE_SHOP_LISTING_REQUIREMENT,
) as PackageShopListingRequirement[];

/**
 * Giá trị cần để chấm cổng đăng xe của gian hàng tuyến gói.
 *
 * Cố ý KHÔNG có `ownerFullName`, `email`, `coverUrl`, `bio`, `taxCode`, toạ độ ghim hay tài
 * khoản nhận tiền: không mục nào trong số đó cần thiết để một chiếc xe xuất hiện đúng trên chợ,
 * và mỗi mục thêm vào đây là một lần chặn người đang muốn bán hàng.
 */
export interface PackageShopListingInput {
  displayName?: string | null;
  /** SĐT liên hệ của CHI NHÁNH MẶC ĐỊNH (dạng lưu `84…` hoặc `0…`; hàm chỉ hỏi có hay không). */
  contactPhone?: string | null;
  provinceCode?: string | null;
  /** Số nhà/đường của chi nhánh mặc định — KHÔNG phải chuỗi hiển thị đã ghép. */
  addressLine?: string | null;
  logoUrl?: string | null;
}

/**
 * Các mục còn thiếu để gian hàng tuyến gói gửi xe lên chợ. Rỗng ⇒ qua cổng.
 *
 * Trả MÃ, không trả câu: danh sách này đi trên dây trong
 * `PROFILE_INCOMPLETE.details.missing` và web dựng nhãn theo ngôn ngữ đang dùng (ADR 0012).
 */
export function missingPackageShopListingRequirements(
  input: PackageShopListingInput,
): PackageShopListingRequirement[] {
  const missing: PackageShopListingRequirement[] = [];
  if (!filled(input.displayName)) missing.push(PACKAGE_SHOP_LISTING_REQUIREMENT.DISPLAY_NAME);
  if (!filled(input.contactPhone)) missing.push(PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE);
  if (!filled(input.provinceCode)) missing.push(PACKAGE_SHOP_LISTING_REQUIREMENT.PROVINCE);
  if (!filled(input.addressLine)) missing.push(PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS);
  if (!filled(input.logoUrl)) missing.push(PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO);
  return missing;
}

/**
 * Các mục còn thiếu để MỞ được gian hàng tuyến gói (bước 1 của onboarding).
 *
 * Đúng bộ trên TRỪ logo — cùng một quy tắc, một chỗ sửa. Logo không bị đòi ở bước tạo vì nó
 * chưa cần thiết để nhận tiền gói, và đòi một tấm ảnh trước khi người ta kịp xem giá là ma sát
 * đặt sai chỗ. Nó bị đòi đúng lúc nó bắt đầu có nghĩa: khi chiếc xe đầu tiên lên chợ.
 */
export function missingPackageShopRegistrationFields(
  input: Omit<PackageShopListingInput, 'logoUrl'>,
): PackageShopListingRequirement[] {
  /*
   * LỌC mục logo ra, không ép một giá trị giả vào `logoUrl`.
   *
   * Bản trước truyền `logoUrl: 'n/a'` để mục đó "đã có". Nó chạy đúng nhưng nói sai: chữ ký nhận
   * một `logoUrl` rồi âm thầm ghi đè, nên nơi gọi không có cách nào biết giá trị mình truyền bị
   * bỏ. `Omit` + lọc nói thẳng cả hai điều: bộ này không hỏi logo, và nó vẫn là cùng một quy tắc.
   */
  return missingPackageShopListingRequirements(input).filter(
    (key) => key !== PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
  );
}
