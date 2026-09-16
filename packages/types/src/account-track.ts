/**
 * "Tài khoản đang đăng nhập là AI trên sàn này" — một phép suy duy nhất cho mọi nhãn hiển thị.
 *
 * Khác hai hàm hàng xóm ở `owner-stage.ts`, và ba câu hỏi này KHÔNG được gộp:
 *
 *   `resolveOwnerStage`      — họ đã đi hết vòng đăng ký chưa?      (bậc TRẢI NGHIỆM)
 *   `tenantUsesManagePortal` — gian hàng này có bộ quản lý không?   (cổng CHẶN, thuộc tính tenant)
 *   `resolveAccountTrack`    — gọi họ là gì trên màn hình?          (NHÃN, vai + tuyến)
 *
 * Nhãn cần một phép suy riêng vì nó là chỗ duy nhất phải phân biệt được cả những ca mà hai hàm
 * kia cố ý gộp lại:
 *
 *  - **Quản lý / nhân viên / người xem không phải chủ.** `tenantUsesManagePortal` trả `true` cho
 *    họ (đúng — họ được vào Manage), nhưng gọi họ là "Chủ gian hàng" là nói sai vai của một con
 *    người thật, ngay trên thẻ tài khoản của chính họ.
 *  - **`unconfigured` không phải một tuyến.** `isCommissionOwnerAccount` trả `true` khi
 *    `billingMode` rỗng — hợp lý cho một cổng chặn ("không có thuê bao hiệu lực thì không vào
 *    Manage"), nhưng dùng nó làm NHÃN là in lên màn hình một lời khẳng định sai về tiền: người
 *    đó được bảo là "Hoa hồng 10%" trong khi backend đang TỪ CHỐI mọi đường ghi tiền của họ
 *    (`TENANT_BILLING_NOT_CONFIGURED` — ADR 0038 điều 1).
 *
 * Hai pha còn lại rơi đúng chỗ mà không cần luật riêng, vì `resolveEffectiveBilling` đã giải
 * chúng trước khi `billingMode` đi trên dây: `grace` giữ `package` ⇒ vẫn là gian hàng;
 * `lapsed` thành `commission` ⇒ thành chủ xe cá nhân. Không nơi nào ở đây được đọc `planCode`
 * hay `tenantType` để đoán tuyến — cả hai đều nói sai (ADR 0014 điều 2 · ADR 0024).
 */

import { TENANT_ROLE } from './rbac';
import { isPackageOnboardingPending } from './shop-onboarding';
import { BILLING_MODE } from './status/billing';

export const ACCOUNT_TRACK = {
  /** Không thuộc gian hàng nào — khách thuê. Không gắn nhãn gì. */
  RENTER: 'renter',
  /** Chủ xe cá nhân, tuyến hoa hồng — làm việc ở Owner Lite trong `/account`. */
  COMMISSION_OWNER: 'commission_owner',
  /** Chủ gian hàng, tuyến gói (kể cả đang trong ÂN HẠN) — làm việc ở `/manage`. */
  SHOP_OWNER: 'shop_owner',
  /** Quản lý / nhân viên / người xem của một gian hàng — nhãn theo VAI, không theo tuyến. */
  SHOP_MEMBER: 'shop_member',
  /**
   * Gian hàng trả phí ĐANG chờ thanh toán lượt gói đầu tiên (ADR 0040 điều 2).
   *
   * Nhãn RIÊNG, và nó phải đứng TRƯỚC `UNCONFIGURED`: hai trạng thái có `billingMode` giống hệt
   * nhau (`null`) nhưng nói hai chuyện ngược nhau. Đây là một bước còn nợ của CHÍNH người dùng —
   * họ chuyển khoản là xong; còn `UNCONFIGURED` là lỗi vận hành của nền tảng mà họ không tự sửa
   * được. Trộn hai thứ nghĩa là mọi người vừa mở gian hàng đều nhận một dải đỏ "liên hệ hỗ trợ"
   * ngay sau bước 1, cho một hệ thống đang chạy đúng.
   */
  PACKAGE_PENDING: 'package_pending',
  /** Chủ xe mà tenant chưa xác định được tuyến — LỖI CẤU HÌNH, không phải một tuyến. */
  UNCONFIGURED: 'unconfigured',
} as const;

export type AccountTrack = (typeof ACCOUNT_TRACK)[keyof typeof ACCOUNT_TRACK];
export const ACCOUNT_TRACK_VALUES = Object.values(ACCOUNT_TRACK) as AccountTrack[];

/**
 * Đúng phần `MeDto.tenant` mà phép suy cần — nhận shape sẵn có để nơi gọi không phải nhào nặn.
 */
export interface AccountTrackInput {
  roleKey?: string | null;
  billingMode?: string | null;
  /**
   * Trục ĐĂNG KÝ (ADR 0040) — bắt buộc để phân biệt "đang chờ thanh toán" với "danh mục gói
   * hỏng". Cả hai đều có `billingMode: null`, nên thiếu trường này là nhãn nói sai về tiền ở
   * đúng nhóm người vừa bấm mở gian hàng.
   */
  onboardingState?: string | null;
  planName?: string | null;
  /*
   * KHÔNG có `planCode` ở đây: docblock đầu file cấm đọc nó để suy tuyến, và một field khai ra
   * mà không ai dùng là một lời mời làm đúng điều đó.
   */
  serviceFeePercent?: number | null;
}

export interface AccountTrackLabelData {
  track: AccountTrack;
  /** Vai trong gian hàng — chỉ có nghĩa với `SHOP_MEMBER`, để nhãn nói đúng "Quản lý"/"Nhân viên". */
  roleKey: string | null;
  /** Tên gói hiển thị — chỉ có nghĩa với `SHOP_OWNER`. */
  planName: string | null;
  /** % phí dịch vụ của tuyến hoa hồng — chỉ có nghĩa với `COMMISSION_OWNER`. */
  serviceFeePercent: number | null;
}

/**
 * Chấm nhãn tài khoản.
 *
 * `serviceFeePercent` trả về là số THẬT của dòng thuê bao đang áp dụng, không phải hằng 10 chép
 * tay: % là DỮ LIỆU admin sửa được (ADR 0029 điều 2), và một nhãn cứng "10%" sẽ nói dối ngay lần
 * đầu ai đó đổi nó. `null` = backend chưa trả — nhãn rút gọn về "Chủ xe cá nhân", không bịa số.
 */
export function resolveAccountTrack(
  tenant: AccountTrackInput | null | undefined,
): AccountTrackLabelData {
  const base = {
    roleKey: tenant?.roleKey ?? null,
    planName: tenant?.planName ?? null,
    serviceFeePercent: tenant?.serviceFeePercent ?? null,
  };
  if (!tenant?.roleKey) return { ...base, track: ACCOUNT_TRACK.RENTER };
  if (tenant.roleKey !== TENANT_ROLE.SHOP_OWNER) {
    return { ...base, track: ACCOUNT_TRACK.SHOP_MEMBER };
  }
  if (tenant.billingMode === BILLING_MODE.PACKAGE) {
    return { ...base, track: ACCOUNT_TRACK.SHOP_OWNER };
  }
  if (tenant.billingMode === BILLING_MODE.COMMISSION) {
    return { ...base, track: ACCOUNT_TRACK.COMMISSION_OWNER };
  }
  /*
   * `billingMode` rỗng có HAI nguyên nhân từ ADR 0040, và chỉ một là sự cố — xem
   * `ACCOUNT_TRACK.PACKAGE_PENDING`. Hỏi trục đăng ký trước khi kết luận "lỗi cấu hình".
   */
  if (isPackageOnboardingPending(tenant)) {
    return { ...base, track: ACCOUNT_TRACK.PACKAGE_PENDING };
  }
  return { ...base, track: ACCOUNT_TRACK.UNCONFIGURED };
}

/**
 * Khoá nhãn trong bó `Account.trackBadge` — bảng dịch sống ở app, phép suy sống ở đây.
 *
 * `renter` không có khoá: người chưa thuộc gian hàng nào thì KHÔNG mang nhãn tuyến, và nơi gọi
 * tự chọn thứ rơi về ("Tài khoản XePrime" trên thẻ hồ sơ, không hiện gì trên viên nhãn).
 */
export type AccountTrackLabelKey =
  | 'commissionOwner'
  | 'shopOwner'
  | 'shopManager'
  | 'shopStaff'
  | 'shopViewer'
  | 'shopMember'
  | 'unconfigured';

/**
 * Tài khoản này gọi là gì — MỘT bảng cho mọi bề mặt hỏi câu đó.
 *
 * ## Vì sao không được dùng `domainLabel('tenantRole', roleKey)` cho câu này
 *
 * Chủ xe cá nhân và chủ gian hàng CÙNG một vai `shop_owner` (ADR 0014): thứ tách họ là TUYẾN,
 * không phải vai. Nên bảng `tenantRole` — đúng khi gọi tên một vai RBAC trong danh sách nhân sự
 * — lại dịch cả hai thành "Chủ gian hàng" khi dùng làm nhãn danh tính. Đó chính là lỗi đã thấy
 * trên `/account` ngày 16/09/2026: đầu trang nói "Chủ xe cá nhân · Hoa hồng 10%" còn thẻ người
 * dùng ngay dưới menu nói "Chủ gian hàng", về cùng một con người.
 *
 * Trả về KHOÁ chứ không phải chuỗi đã dịch: package này framework-free và không mang bảng dịch
 * (bó `Account.trackBadge` nằm ở `@xeprime/domain`, web và native cùng đọc).
 *
 * Ca `SHOP_OWNER` và `COMMISSION_OWNER` còn có biến thể MANG THÊM SỐ ("· Gói X", "· Hoa hồng
 * N%") — chúng là việc của viên nhãn đầy đủ (`AccountTrackBadge`), không phải của một dòng vai
 * trong thẻ người dùng, nên không nằm ở đây.
 */
export function accountTrackLabelKey(track: AccountTrack, roleKey: string | null): AccountTrackLabelKey | null {
  switch (track) {
    case ACCOUNT_TRACK.RENTER:
      return null;
    case ACCOUNT_TRACK.COMMISSION_OWNER:
      return 'commissionOwner';
    case ACCOUNT_TRACK.SHOP_OWNER:
      return 'shopOwner';
    case ACCOUNT_TRACK.UNCONFIGURED:
      return 'unconfigured';
    default:
      break;
  }

  /*
   * Thành viên gian hàng: nhãn nói đúng VAI, vì gọi một nhân viên là "Chủ gian hàng" ngay trên
   * thẻ tài khoản của chính họ là sai về con người.
   *
   * Nhánh dự phòng không phải phòng thủ thừa: vai là dữ liệu trên dây (`TENANT_ROLE` có thể thêm
   * giá trị ở backend trước khi client kịp deploy), và một khoá `undefined` sẽ ném ngay giữa lúc
   * render thanh điều hướng.
   */
  switch (roleKey) {
    case TENANT_ROLE.SHOP_MANAGER:
      return 'shopManager';
    case TENANT_ROLE.SHOP_STAFF:
      return 'shopStaff';
    case TENANT_ROLE.SHOP_VIEWER:
      return 'shopViewer';
    default:
      return 'shopMember';
  }
}
