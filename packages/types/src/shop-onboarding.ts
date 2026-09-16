/**
 * HAI TUYẾN ĐĂNG KÝ — "người này vào cửa nào, và họ còn nợ bước nào" (ADR 0040).
 *
 * ## Vì sao cần một trục riêng, lưu ở DB
 *
 * Đến 16/09/2026 hai điểm vào — "Đăng xe cho thuê" (tuyến hoa hồng) và "Đăng ký gian hàng"
 * (tuyến trả phí) — dùng CHUNG `ShopRegistration`, chung `POST /tenants`, và chỉ khác nhau ở
 * một prop `variant` quyết định câu chữ. Sau khi tạo tenant, backend gán gói hoa hồng mặc định
 * cho MỌI tenant, nên `/auth/me` trả `billingMode: 'commission'` cho cả hai — và người vừa bấm
 * "Đăng ký gian hàng" bị điều hướng vào đúng màn "Hồ sơ chủ xe" của tuyến hoa hồng.
 *
 * Bốn cách phân biệt đều đã được thử và đều sai vì cùng một lý do — chúng không sống qua một
 * lần F5:
 *
 *   `variant` của component · `?next=` trong URL · state của router · "có gói hay chưa"
 *
 * Nên ý định đăng ký là DỮ LIỆU, nằm ở `tenants.onboarding_state`. Đóng trình duyệt rồi đăng
 * nhập lại vẫn quay về đúng bước còn nợ; không có cache hay closure nào tham gia vào câu trả
 * lời.
 *
 * ## Ba trạng thái, và ranh giới giữa chúng là SỰ KIỆN có thật
 *
 * | Trạng thái | Khi nào | Người dùng vào được đâu |
 * | --- | --- | --- |
 * | `commission` | Vào bằng cửa "Đăng xe cho thuê" (mặc định) | Owner Lite ở `/account` |
 * | `package_pending` | Vào bằng cửa "Đăng ký gian hàng", CHƯA trả tiền | CHỈ màn onboarding (chọn gói → chuyển khoản) |
 * | `package_active` | Hoá đơn gói đã `paid` và thuê bao đã bật | `/manage` đầy đủ |
 *
 * Mốc `package_pending → package_active` được ghi trong CHÍNH transaction kích hoạt gói
 * (`BillingService.activateFromInvoiceWithinTx`, và đường admin gán tay). Không có job nào,
 * không có bước nào do client báo — "tôi đã chuyển khoản" không phải một sự kiện.
 *
 * ## `package_active` là VĨNH VIỄN, có chủ đích
 *
 * Gói hết hạn thì tenant rơi về tuyến hoa hồng (`resolveEffectiveBilling` → `LAPSED`) nhưng
 * trạng thái này KHÔNG lùi lại. Nó trả lời "người này đã từng đi qua cửa gian hàng chưa", và
 * câu trả lời đó không đổi. Lùi nó về `package_pending` sẽ đẩy một gian hàng đang vận hành
 * thật vào màn onboarding lần đầu; lùi về `commission` sẽ mời họ vào wizard "Hồ sơ chủ xe →
 * Đăng xe đầu tiên → Lên chợ" mà họ đã làm xong từ lâu.
 *
 * ## Độc lập với ba trục đã có
 *
 *   `tenants.status`        — gian hàng còn được hoạt động không (khoá/mở của nền tảng)
 *   `billingMode` (gói)     — tiền chạy theo tuyến nào NGAY LÚC NÀY
 *   `SHOP_VERIFICATION`     — nền tảng đã xem xét pháp nhân chưa
 *   `onboardingState`       — người này vào cửa nào, và còn nợ bước nào
 *
 * Đừng gộp: một gian hàng `package_active` có thể đang `lapsed`, đang `suspended`, và chưa
 * `verified` — bốn câu trả lời khác nhau cho bốn câu hỏi khác nhau.
 */

import { BILLING_MODE } from './status/billing';
import { tenantUsesManagePortal } from './owner-stage';

/**
 * Cửa vào mà người đăng ký đã chọn — tham số của `POST /tenants`.
 *
 * Nó KHÔNG được lưu nguyên dạng: nó quyết định `onboardingState` ban đầu (xem
 * {@link shopOnboardingStateForTrack}). Hai giá trị ở đây là hợp đồng với client; ba giá trị
 * của `SHOP_ONBOARDING_STATE` là trạng thái lưu trữ, và chúng khác nhau vì trạng thái còn phải
 * kể được chặng đã đi qua.
 */
export const REGISTRATION_TRACK = {
  /** "Đăng xe cho thuê" / "Trở thành chủ xe" — tuyến hoa hồng, không thuê bao. */
  COMMISSION: 'commission',
  /** "Đăng ký gian hàng" — tuyến trả phí theo gói, phải thanh toán trước khi vào Manage. */
  PACKAGE: 'package',
} as const;

export type RegistrationTrack = (typeof REGISTRATION_TRACK)[keyof typeof REGISTRATION_TRACK];

export const REGISTRATION_TRACK_VALUES = Object.values(REGISTRATION_TRACK) as RegistrationTrack[];

export function isRegistrationTrack(value: unknown): value is RegistrationTrack {
  return (REGISTRATION_TRACK_VALUES as unknown[]).includes(value);
}

/** `?track=` trong URL của màn onboarding — giá trị lạ rơi về tuyến hoa hồng (cửa mặc định). */
export function registrationTrackOf(value: string | null | undefined): RegistrationTrack {
  return isRegistrationTrack(value) ? value : REGISTRATION_TRACK.COMMISSION;
}

/** Giá trị lưu ở `tenants.onboarding_state`. */
export const SHOP_ONBOARDING_STATE = {
  /** Tuyến hoa hồng — không có bước nào phải chờ. Mặc định của mọi tenant. */
  COMMISSION: 'commission',
  /** Gian hàng tuyến gói ĐANG chờ thanh toán lượt gói đầu tiên. */
  PACKAGE_PENDING: 'package_pending',
  /** Gian hàng tuyến gói đã trả tiền xong ít nhất một lần — onboarding hoàn tất. */
  PACKAGE_ACTIVE: 'package_active',
} as const;

export type ShopOnboardingState =
  (typeof SHOP_ONBOARDING_STATE)[keyof typeof SHOP_ONBOARDING_STATE];

export const SHOP_ONBOARDING_STATE_VALUES = Object.values(
  SHOP_ONBOARDING_STATE,
) as ShopOnboardingState[];

export function isShopOnboardingState(value: unknown): value is ShopOnboardingState {
  return (SHOP_ONBOARDING_STATE_VALUES as unknown[]).includes(value);
}

/** Trạng thái lưu lúc tạo tenant, theo cửa người dùng đã vào. */
export function shopOnboardingStateForTrack(track: RegistrationTrack): ShopOnboardingState {
  return track === REGISTRATION_TRACK.PACKAGE
    ? SHOP_ONBOARDING_STATE.PACKAGE_PENDING
    : SHOP_ONBOARDING_STATE.COMMISSION;
}

/**
 * Đúng phần scope mà bốn phép suy dưới đây cần — nhận shape sẵn có của `MeDto.tenant` và
 * `req.tenant` để nơi gọi không phải nhào nặn gì.
 */
export interface ShopOnboardingInput {
  onboardingState?: string | null;
  billingMode?: string | null;
}

/**
 * Gian hàng ĐANG nợ bước thanh toán gói đầu tiên — điều kiện của màn onboarding bước 2.
 *
 * Hỏi CẢ HAI trục, không chỉ `onboardingState`: admin nền tảng gán gói tay
 * (`BillingService.assign`) cũng hoàn tất onboarding, nhưng một dòng dữ liệu cũ hoặc một lượt
 * gán qua đường khác có thể để lại `package_pending` cạnh một gói đang hiệu lực. Khi đó tiền
 * ĐÃ về — và một màn "hãy chuyển khoản" đứng trước một gian hàng đã trả tiền là lỗi tệ hơn
 * hẳn so với việc bỏ sót một lần cập nhật cột.
 */
export function isPackageOnboardingPending(
  tenant: ShopOnboardingInput | null | undefined,
): boolean {
  if (tenant?.onboardingState !== SHOP_ONBOARDING_STATE.PACKAGE_PENDING) return false;
  return !tenantUsesManagePortal(tenant);
}

/**
 * Gian hàng ĐÃ đi qua cửa gói và trả tiền ít nhất một lần.
 *
 * Dùng để không mời một gian hàng hết gói vào wizard đăng ký chủ xe lần đầu: họ không phải
 * người mới, họ là khách cũ cần gia hạn. Xem docblock đầu file, mục "`package_active` là vĩnh
 * viễn".
 */
export function isEstablishedPackageShop(tenant: ShopOnboardingInput | null | undefined): boolean {
  return tenant?.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE;
}

/**
 * Gian hàng đang ở TUYẾN GÓI theo nghĩa sản phẩm — dùng cho các cổng chỉ áp với gian hàng trả
 * phí (ví dụ cổng logo trước khi gửi xe duyệt).
 *
 * `package_pending` tính là CÓ: họ đã chọn cửa gian hàng, và luật của gian hàng áp cho họ ngay
 * — kể cả khi `billingMode` còn chưa xác định vì chưa có dòng thuê bao nào. Chủ xe tuyến hoa
 * hồng thì không bao giờ tính, và đó là điểm mấu chốt: bắt một người có một chiếc xe phải có
 * logo gian hàng là dựng lại đúng rào cản mà ADR 0036 vừa gỡ.
 */
export function isPackageShopTrack(tenant: ShopOnboardingInput | null | undefined): boolean {
  if (!tenant) return false;
  if (tenant.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_PENDING) return true;
  if (tenant.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE) return true;
  return tenant.billingMode === BILLING_MODE.PACKAGE;
}
