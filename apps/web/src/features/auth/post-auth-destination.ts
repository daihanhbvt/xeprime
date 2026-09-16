import {
  OWNER_STAGE,
  TENANT_ROLE,
  isEstablishedPackageShop,
  isPackageOnboardingPending,
  resolveOwnerStage,
  tenantUsesManagePortal,
} from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { isSafeNextPath, safeNextPath } from './safe-next';

/**
 * "Sau khi đăng nhập thì đi đâu" — hàm THUẦN, tách khỏi component để test được và để hai
 * presentation (modal khách / trang portal) không trôi khỏi nhau.
 *
 * Đây chính là chỗ bug gốc từng nằm: mọi đường đăng nhập đều mặc định về `/manage`, nên khách
 * thuê xe bị đẩy vào khu quản lý rồi bị hỏi tạo gian hàng. Quy tắc bây giờ: **đích phụ thuộc
 * ngữ cảnh mở auth, không phụ thuộc việc user có tài khoản hay không.**
 */

/**
 * Người dùng như `/auth/me` trả về — chỉ lấy phần quyết định điều hướng.
 * Nhận cả `undefined` để dùng được với mọi shape gọi tới (kể cả response cũ thiếu field).
 */
export interface AuthScope {
  /**
   * Đủ để chọn KHU, không chỉ để biết "có gian hàng hay không".
   *
   * Bốn trường sau `id` là thứ phân biệt hai tuyến của ADR 0028: chủ xe tuyến hoa hồng làm việc
   * ở `/account`, gian hàng có gói làm việc ở `/manage`. Trước đây chỉ có `id`, nên MỌI người có
   * tenant đều bị đẩy vào cổng quản lý — kể cả người vừa đăng ký xong một chiếc xe.
   */
  tenant?: {
    id: string;
    roleKey?: string | null;
    status?: string | null;
    billingMode?: string | null;
    /**
     * Trục ĐĂNG KÝ (ADR 0040) — `commission` · `package_pending` · `package_active`.
     *
     * Bắt buộc phải ở đây vì `billingMode` một mình KHÔNG phân biệt được ba tình huống mà
     * `resolveWorkspaceHref` phải rẽ ba đường khác nhau:
     *
     *  - gian hàng trả phí chưa chuyển khoản (`billingMode` rỗng) → màn thanh toán;
     *  - danh mục gói hỏng (`billingMode` rỗng) → Owner Lite, và log lỗi ở server;
     *  - gian hàng đã trả tiền mà hết gói (`billingMode = commission`) → danh sách xe, KHÔNG
     *    phải wizard "đăng ký chủ xe lần đầu".
     */
    onboardingState?: string | null;
    publicVehicleCount?: number | null;
  } | null;
  platformRole?: string | null;
}

/**
 * "Khu làm việc của người này ở đâu" — `/manage` hay `/account`.
 *
 * MỘT nơi trả lời, vì câu hỏi này xuất hiện ở rất nhiều chỗ: sau đăng nhập, CTA chủ xe, thẻ gian
 * hàng ở trang tài khoản, menu marketplace, màn kết thúc wizard đăng xe, và cổng chặn của
 * `AppShell`. Mỗi nơi tự quyết định là mỗi nơi một luật, và đó chính là hiện trạng đang sửa.
 *
 * Luật (sửa 16/09/2026 — xem bên dưới):
 *  - Không có gian hàng → `null` (nơi gọi tự chọn: landing đăng xe, hay ở nguyên trang).
 *  - Gian hàng TRẢ PHÍ chưa thanh toán lượt gói đầu → `/manage/onboarding` (bước 2). Đọc TRƯỚC
 *    mọi luật khác — xem "Vì sao tuyến gói đọc trước" bên dưới.
 *  - Gian hàng có THUÊ BAO hiệu lực (kể cả đang trong ân hạn) → `/manage`, cho MỌI vai.
 *  - Còn lại → `/account`: chủ xe về Owner Lite (đang đăng ký thì về màn tiến trình, xong rồi
 *    thì về danh sách xe); nhân viên của gian hàng đó về khu tài khoản cá nhân.
 *
 * ## Vì sao tuyến gói đọc TRƯỚC (ADR 0040)
 *
 * Gian hàng trả phí đang chờ đối soát cố ý KHÔNG có dòng thuê bao nào, nên `billingMode` của họ
 * rỗng — cùng hình dạng với một tenant có danh mục gói hỏng. Mọi phép suy chỉ dựa vào
 * `billingMode` đẩy họ vào Owner Lite, tức là đúng màn "Hồ sơ chủ xe" mà ADR 0040 sinh ra để họ
 * không bao giờ thấy. Câu hỏi "họ vào bằng cửa nào" phải được trả lời trước câu hỏi "tiền đang
 * chạy theo tuyến nào".
 *
 * Và ở chiều ngược lại: gian hàng ĐÃ trả tiền mà hết gói (`package_active` + `commission`) về
 * DANH SÁCH XE, không về màn tiến trình đăng ký. Họ đã đi hết vòng đó; mời họ làm lại là nói
 * sai với chính người đang cần một nút gia hạn.
 *
 * ## Vì sao đổi
 *
 * Bản trước hỏi `isCommissionTrack`, một hàm gộp VAI với TUYẾN. Vì nó đòi `roleKey ===
 * shop_owner`, nó trả `false` cho quản lý/nhân viên/người xem — và `!false` đưa họ vào `/manage`
 * của MỌI gian hàng, kể cả gian hàng tuyến hoa hồng và gian hàng đã hết gói. Docblock cũ ghi
 * hẳn điều đó ra như một quy tắc ("và nhân viên của mọi gian hàng → /manage").
 *
 * Nay câu hỏi là thuộc tính của TENANT (`tenantUsesManagePortal`), không hỏi vai: hết gói thì cả
 * gian hàng ra khỏi Manage cùng lúc, không ai ở lại nhờ `roleKey` của mình.
 */
export function resolveWorkspaceHref(user: AuthScope | null | undefined): string | null {
  const tenant = user?.tenant;
  if (!tenant) return null;
  /*
   * CHƯA TRẢ TIỀN LƯỢT GÓI ĐẦU — bước 2 của onboarding, và câu này đọc TRƯỚC `billingMode`.
   *
   * Nhân viên thì sao: một gian hàng `package_pending` chưa có nhân viên nào (chưa vào được
   * Manage, chưa mời được ai), nên nhánh này trên thực tế chỉ có chủ đi qua. Không hỏi vai ở đây
   * có chủ đích — nếu một ngày có nhân viên trong tình trạng đó, đưa họ tới màn nói rõ "gian hàng
   * chưa thanh toán" vẫn đúng hơn là thả họ vào Owner Lite của người khác.
   */
  if (isPackageOnboardingPending(tenant)) return ROUTES.MANAGE.ONBOARDING;
  if (tenantUsesManagePortal(tenant)) return ROUTES.MANAGE.ROOT;
  /*
   * Không có thuê bao hiệu lực. Chủ xe về Owner Lite; nhân viên/quản lý/người xem của gian hàng
   * đó KHÔNG có Owner Lite (đó là bộ công cụ của chủ xe) nên họ về khu tài khoản cá nhân.
   */
  if (tenant.roleKey !== TENANT_ROLE.SHOP_OWNER) return ROUTES.ACCOUNT.ROOT;
  /*
   * Gian hàng ĐÃ từng trả tiền mà gói hết hạn: về DANH SÁCH XE, không về màn tiến trình đăng ký.
   *
   * `resolveOwnerStage` sẽ chấm họ là `registering` ngay khi chiếc xe cuối cùng rời chợ (hạn mức
   * gói thu nhỏ, hay chính họ ẩn xe), và màn tiến trình thì kể một câu chuyện ba bước dành cho
   * người chưa bắt đầu. Với một gian hàng 10 xe vừa hết gói, đó là câu chuyện sai hoàn toàn.
   */
  if (isEstablishedPackageShop(tenant)) return ROUTES.ACCOUNT.VEHICLES;
  return resolveOwnerStage(tenant) === OWNER_STAGE.OWNER
    ? ROUTES.ACCOUNT.VEHICLES
    : ROUTES.ACCOUNT.REGISTRATION;
}

/** Khu làm việc là `/manage` — tức người này ĐƯỢC vào cổng quản lý. */
export function canUseManagePortal(user: AuthScope | null | undefined): boolean {
  return resolveWorkspaceHref(user) === ROUTES.MANAGE.ROOT;
}

/**
 * Người này đang ở giữa luồng mở gian hàng trả phí — màn onboarding là nơi DUY NHẤT họ vào được.
 *
 * Tách thành hàm riêng thay vì để mỗi nơi tự so `resolveWorkspaceHref(user) === ONBOARDING`:
 * `AppShell`, `WorkspaceProvider` và chính trang onboarding đều hỏi nó, và ba phép so chuỗi là
 * ba chỗ để một lần đổi route làm hỏng cổng chặn mà không ai thấy.
 */
export function isPackageOnboarding(user: AuthScope | null | undefined): boolean {
  return isPackageOnboardingPending(user?.tenant);
}

/** Ý định mở cổng quản lý, đi trong URL (`?intent=owner`). */
export const AUTH_INTENT = {
  OWNER: 'owner',
} as const;

export type AuthIntent = (typeof AUTH_INTENT)[keyof typeof AUTH_INTENT];

/** Chế độ của form auth. */
export const AUTH_MODE = {
  LOGIN: 'login',
  REGISTER: 'register',
} as const;

export type AuthMode = (typeof AUTH_MODE)[keyof typeof AUTH_MODE];

export function isAuthMode(value: string | null | undefined): value is AuthMode {
  return value === AUTH_MODE.LOGIN || value === AUTH_MODE.REGISTER;
}

/**
 * Đích sau khi KHÁCH đăng nhập/đăng ký từ marketplace.
 *
 * `null` = không điều hướng: đóng modal và ở nguyên trang đang xem. Đây là mặc định, KHÔNG
 * phải `/manage` — khách đăng nhập từ header trang chủ thì phải vẫn ở trang chủ.
 */
export function resolveCustomerDestination(next: string | null | undefined): string | null {
  return isSafeNextPath(next) ? next : null;
}

/**
 * Đích sau khi đăng nhập ở CỔNG QUẢN LÝ, theo scope thật lấy từ `/auth/me`.
 *
 * Thứ tự quyết định:
 *  1. `next` an toàn → tôn trọng ý định ban đầu (proxy đặt `next` khi chặn route).
 *     Riêng route nền tảng: user không có `platformRole` KHÔNG được đưa tới đó — trả về
 *     `/manage` để họ gặp màn hợp lệ, còn 403 thật do layout admin + guard backend quyết định.
 *  2. `intent=owner` và chưa có gian hàng → onboarding (owner intent tường minh).
 *  3. Có gian hàng → khu làm việc của họ (`resolveWorkspaceHref`): `/manage` với gian hàng có
 *     gói và nhân viên, `/account` với chủ xe tuyến hoa hồng.
 *  4. Chỉ có platform role → `/manage/admin`.
 *  5. Không tenant, không platform, không owner intent → `/manage` (ở đó hiện màn "Bạn chưa có
 *     gian hàng", KHÔNG tự bật form tạo shop).
 */
export function resolvePortalDestination(params: {
  user: AuthScope;
  next?: string | null;
  intent?: string | null;
}): string {
  const { user, next, intent } = params;
  const hasTenant = user.tenant != null;
  const isPlatform = Boolean(user.platformRole);
  const workspace = resolveWorkspaceHref(user);

  if (isSafeNextPath(next)) {
    if (isPlatformRoute(next) && !isPlatform) return workspace ?? ROUTES.MANAGE.ROOT;
    /*
     * Chủ xe tuyến hoa hồng gõ (hoặc được `next` dẫn) tới một trang `/manage` thì không đi tới
     * đó, kể cả khi họ có gian hàng: khu đó không dành cho họ (ADR 0027/0028). Đưa về đúng khu
     * của mình thay vì để `AppShell` nhận rồi đá ra — một cú nhảy, không phải hai.
     */
    if (isManageRoute(next) && !isPlatform && workspace !== ROUTES.MANAGE.ROOT) {
      /*
       * `isOnboardingRoute`, KHÔNG so chuỗi bằng nhau (sửa 16/09/2026).
       *
       * Từ ADR 0040, đường vào onboarding mang `?track=package` — nên phép so `next ===
       * ROUTES.MANAGE.ONBOARDING` trả `false` và người vừa bấm "Đăng ký gian hàng" rồi đăng nhập
       * bị đẩy về `/manage` (màn "bạn chưa có gian hàng"), mất luôn cửa họ đã chọn.
       */
      if (isOnboardingRoute(next) && !hasTenant) return next;
      return workspace ?? ROUTES.MANAGE.ROOT;
    }
    // Đừng ném người chưa có gian hàng vào một trang quản lý gian hàng cụ thể — họ sẽ thấy
    // dashboard rỗng/lỗi. Cho về `/manage` để gặp màn lựa chọn.
    if (!hasTenant && !isPlatform && !isOnboardingRoute(next)) {
      return intent === AUTH_INTENT.OWNER ? ROUTES.MANAGE.ONBOARDING : ROUTES.MANAGE.ROOT;
    }
    return next;
  }

  if (intent === AUTH_INTENT.OWNER && !hasTenant) return ROUTES.MANAGE.ONBOARDING;
  if (workspace) return workspace;
  if (isPlatform) return ROUTES.MANAGE.ADMIN;
  return ROUTES.MANAGE.ROOT;
}

/** `/manage` và mọi route con. */
export function isManageRoute(pathname: string): boolean {
  return pathname === ROUTES.MANAGE.ROOT || pathname.startsWith(`${ROUTES.MANAGE.ROOT}/`);
}

/**
 * Đường này có phải màn ONBOARDING không — so PHẦN ĐƯỜNG DẪN, bỏ qua query.
 *
 * Từ ADR 0040 route đó mang `?track=`, nên mọi phép so bằng chuỗi trần đều hỏng âm thầm: nó vẫn
 * biên dịch, vẫn chạy, và chỉ sai đúng ở nhánh người dùng bấm CTA gian hàng rồi mới đăng nhập.
 */
export function isOnboardingRoute(path: string | null | undefined): boolean {
  if (!path) return false;
  const [pathname] = path.split('?');
  return pathname === ROUTES.MANAGE.ONBOARDING;
}

/** `/manage/admin` và mọi route con. */
export function isPlatformRoute(pathname: string): boolean {
  return pathname === ROUTES.MANAGE.ADMIN || pathname.startsWith(`${ROUTES.MANAGE.ADMIN}/`);
}

/**
 * Đích khi bấm CTA chủ xe ("Đăng xe cho thuê", "Trở thành chủ xe").
 * Chưa đăng nhập → portal login kèm owner intent; đã có gian hàng → thẳng vào portal.
 */
export function resolveOwnerCtaHref(user: AuthScope | null | undefined): string {
  /*
   * 09/09/2026: mọi CTA chủ xe đi qua LANDING "Đăng xe cho thuê" trước.
   *
   * Trước đây nút này ném thẳng người chưa đăng nhập vào form tạo gian hàng — hỏi tên gian hàng
   * và mã số thuế trước khi họ kịp biết mình được gì. Landing là trang công khai, đọc xong mới
   * quyết định, và chính nó rẽ tiếp theo trạng thái thật (đăng nhập → onboarding → wizard).
   */
  return resolveWorkspaceHref(user) ?? ROUTES.LIST_YOUR_VEHICLE.ROOT;
}

/** Đích khi phiên hỏng/hết hạn ở khu quản lý: quay lại portal login, giữ đường đang mở. */
export function portalLoginWithNext(pathname: string): string {
  return `${ROUTES.MANAGE.LOGIN}?next=${encodeURIComponent(
    safeNextPath(pathname, ROUTES.MANAGE.ROOT),
  )}`;
}
