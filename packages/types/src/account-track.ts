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
  return { ...base, track: ACCOUNT_TRACK.UNCONFIGURED };
}
