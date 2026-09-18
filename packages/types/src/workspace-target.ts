import { OWNER_STAGE, resolveOwnerStage, tenantUsesManagePortal } from './owner-stage';
import { TENANT_ROLE } from './rbac';
import { isEstablishedPackageShop, isPackageOnboardingPending } from './shop-onboarding';

/**
 * "Khu làm việc của người này ở đâu" — phép suy DÙNG CHUNG, trả về KHOÁ chứ không trả đường dẫn.
 *
 * ## Vì sao khoá chứ không phải href
 *
 * Câu hỏi thì một, địa chỉ thì hai: web đi tới `/manage/onboarding`, app native đi tới một `Href`
 * của expo-router. Trước đợt này mỗi app tự dựng lại cùng một chuỗi `if`, và đó là ba luật sống
 * song song — `isPackageOnboardingPending` phải đọc TRƯỚC `billingMode`, gian hàng hết gói phải về
 * danh sách xe chứ không về wizard đăng ký — mà không có gì bắt chúng đi cùng nhau.
 *
 * Cùng khuôn `status-notice.ts` đã dùng: chia sẻ KHOÁ, mỗi app giữ một bảng ánh xạ khoá → đích.
 *
 * ## Thứ tự quyết định, và vì sao nó là thứ tự đó
 *
 * 1. Không có gian hàng ⇒ `null`; nơi gọi tự chọn (landing đăng xe, hay ở nguyên màn).
 * 2. **Gian hàng TRẢ PHÍ chưa thanh toán lượt gói đầu ⇒ `onboarding`.** Đọc TRƯỚC mọi luật khác:
 *    họ cố ý không có dòng thuê bao nào, nên `billingMode` rỗng — cùng hình dạng với một tenant có
 *    danh mục gói hỏng. Mọi phép suy chỉ nhìn `billingMode` đẩy họ vào Owner Lite, tức đúng màn
 *    "Hồ sơ chủ xe" mà ADR 0040 sinh ra để họ không bao giờ thấy.
 * 3. Có thuê bao hiệu lực (kể cả đang ÂN HẠN) ⇒ `manage`, cho MỌI vai. Câu hỏi là thuộc tính của
 *    TENANT, không hỏi vai: hết ân hạn thì cả gian hàng rời khu quản lý cùng lúc.
 * 4. Không phải chủ ⇒ `account`. Quản lý/nhân viên/người xem KHÔNG có Owner Lite — đó là bộ công
 *    cụ của chủ xe.
 * 5. Gian hàng ĐÃ từng trả tiền mà hết gói ⇒ `vehicles`, KHÔNG phải màn tiến trình đăng ký.
 *    `resolveOwnerStage` chấm họ là `registering` ngay khi chiếc xe cuối rời chợ, và màn đó kể một
 *    câu chuyện ba bước dành cho người chưa bắt đầu — với một gian hàng 10 xe vừa cần gia hạn thì
 *    đó là câu chuyện sai hoàn toàn.
 * 6. Còn lại: chủ xe tuyến hoa hồng — đang đăng ký thì `registration`, xong rồi thì `vehicles`.
 */
export const WORKSPACE_TARGET = {
  /** Bước 2 của onboarding gian hàng trả phí — chưa chuyển khoản. */
  ONBOARDING: 'onboarding',
  /** Cổng quản lý gian hàng đầy đủ. */
  MANAGE: 'manage',
  /** Khu tài khoản cá nhân — nhân sự của một gian hàng không ở tuyến gói. */
  ACCOUNT: 'account',
  /** Danh sách xe của Owner Lite. */
  VEHICLES: 'vehicles',
  /** Màn tiến trình đăng ký chủ xe. */
  REGISTRATION: 'registration',
} as const;

export type WorkspaceTarget = (typeof WORKSPACE_TARGET)[keyof typeof WORKSPACE_TARGET];

/**
 * Đúng phần `MeDto.tenant` mà phép suy cần — nhận shape sẵn có để nơi gọi không phải nhào nặn.
 */
export interface WorkspaceTargetInput {
  roleKey?: string | null;
  billingMode?: string | null;
  onboardingState?: string | null;
  publicVehicleCount?: number | null;
}

/** `null` = không thuộc gian hàng nào; nơi gọi tự quyết định thả người dùng ở đâu. */
export function resolveWorkspaceTarget(
  tenant: WorkspaceTargetInput | null | undefined,
): WorkspaceTarget | null {
  if (!tenant) return null;
  if (isPackageOnboardingPending(tenant)) return WORKSPACE_TARGET.ONBOARDING;
  if (tenantUsesManagePortal(tenant)) return WORKSPACE_TARGET.MANAGE;
  if (tenant.roleKey !== TENANT_ROLE.SHOP_OWNER) return WORKSPACE_TARGET.ACCOUNT;
  if (isEstablishedPackageShop(tenant)) return WORKSPACE_TARGET.VEHICLES;
  return resolveOwnerStage(tenant) === OWNER_STAGE.OWNER
    ? WORKSPACE_TARGET.VEHICLES
    : WORKSPACE_TARGET.REGISTRATION;
}
