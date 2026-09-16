/**
 * "Người này đã là chủ xe chưa" — MỘT định nghĩa cho menu, cổng chặn và màn tiến trình.
 *
 * Câu hỏi này trước đây không có câu trả lời ở đâu cả. Web chỉ hỏi `tenant.roleKey ===
 * shop_owner`, tức là **có bản ghi tenant** là thành chủ xe — kể cả khi hồ sơ còn nháp, chưa ai
 * duyệt, và chưa có chiếc xe nào lên chợ. Hệ quả là người vừa điền xong form đăng ký đã thấy
 * đầy đủ lịch xe rỗng, sổ chuyến rỗng, khai thuế rỗng, và một cổng quản lý không dành cho họ.
 *
 * Ba bậc, và ranh giới giữa chúng là **sự kiện có thật**, không phải một cột trạng thái tự khai:
 *
 * | Bậc | Khi nào | Người dùng thấy gì |
 * | --- | --- | --- |
 * | `none` | Không có tenant, hoặc thuộc tenant với vai KHÁC `shop_owner` (nhân viên gian hàng) | Khu khách thuê bình thường |
 * | `registering` | Là `shop_owner` nhưng hồ sơ chưa `active` HOẶC chưa có xe nào lên chợ | Đúng MỘT màn: tiến trình hồ sơ + xe đang chờ |
 * | `owner` | Hồ sơ `active` **và** có ≥1 xe `approved_public` | Đủ bộ chủ xe: xe, lịch, chuyến, khai thuế… |
 *
 * Vì sao mốc là **xe đã lên chợ** chứ không phải hồ sơ đã duyệt: một hồ sơ được duyệt mà không
 * có xe nào công khai thì không có gì để quản lý — lịch rỗng, chuyến rỗng, tiền rỗng. Mở đủ menu
 * lúc đó là bày ra sáu màn trống và để người dùng tự đoán mình đang thiếu bước nào. Bậc
 * `registering` tồn tại để trả lời đúng câu đó ở một chỗ.
 *
 * Đây là lớp TRẢI NGHIỆM. Lớp chặn thật vẫn là `TenantScopeGuard` + permission + cờ gói ở
 * backend (ADR 0002 · ADR 0027 điều 4); bậc ở đây không bao giờ được dùng thay cho chúng.
 */

import { TENANT_ROLE } from './rbac';
import { BILLING_MODE } from './status/billing';
import { TENANT_STATUS } from './status/tenant';

export const OWNER_STAGE = {
  /** Không phải chủ xe (khách thuê, hoặc nhân viên của một gian hàng). */
  NONE: 'none',
  /** Đã mở hồ sơ chủ xe nhưng chưa đi hết vòng duyệt. */
  REGISTERING: 'registering',
  /** Hồ sơ đã duyệt và có xe đang bán trên chợ. */
  OWNER: 'owner',
} as const;

export type OwnerStage = (typeof OWNER_STAGE)[keyof typeof OWNER_STAGE];

export const OWNER_STAGE_VALUES = Object.values(OWNER_STAGE) as OwnerStage[];

/**
 * Thứ cần để chấm bậc — cố ý nhận đúng shape mà `MeDto.tenant` trả về, để nơi gọi không phải
 * nhào nặn gì và không có bản sao thứ hai của cùng phép so sánh.
 */
export interface OwnerStageInput {
  roleKey?: string | null;
  status?: string | null;
  /** Số xe đang `approved_public` của gian hàng. `null`/`undefined` = backend cũ chưa trả. */
  publicVehicleCount?: number | null;
}

/**
 * Bậc của người đang đăng nhập.
 *
 * `publicVehicleCount` vắng mặt được coi là **0**, không phải "chưa biết nên cho qua": mở nhầm
 * đủ menu cho người chưa có xe là đúng lỗi hàm này sinh ra để chặn, còn đóng nhầm thì người
 * dùng thấy màn tiến trình và vẫn đi tiếp được.
 */
export function resolveOwnerStage(tenant: OwnerStageInput | null | undefined): OwnerStage {
  if (!tenant || tenant.roleKey !== TENANT_ROLE.SHOP_OWNER) return OWNER_STAGE.NONE;
  const hasPublicVehicle = (tenant.publicVehicleCount ?? 0) > 0;
  if (tenant.status === TENANT_STATUS.ACTIVE && hasPublicVehicle) return OWNER_STAGE.OWNER;
  return OWNER_STAGE.REGISTERING;
}

/**
 * Chủ xe TUYẾN HOA HỒNG — Basic Owner của [ADR 0028 điều 1].
 *
 * ⚠️ Nguồn là **`billingMode` của gói hiện hành**, KHÔNG phải `planCode == null`.
 *
 * Bản trước của hàm này (và `isCommissionOwner` ở web) hỏi `planCode == null`, và nó sai với mọi
 * gian hàng trên hệ thống: `BillingService.assignDefaultPlanWithinTx` gán cho **mọi** tenant mới
 * một gói bậc `commission` ngay trong transaction đăng ký, nên `planCode` gần như không bao giờ
 * rỗng. Hệ quả nếu giữ nguyên: 100% chủ xe tuyến hoa hồng bị xếp nhầm sang tuyến gói — tức là
 * cổng chặn `/manage` không chặn được một ai.
 *
 * `billingMode` vắng mặt (không có gói hiệu lực — gói hết hạn, hoặc danh mục gói cấu hình thiếu)
 * cũng tính là tuyến hoa hồng: không có thuê bao hiệu lực thì không có quyền dùng bộ quản lý đầy
 * đủ, và đó đúng là điều ADR 0027 điều 3 mô tả.
 *
 * Độc lập hoàn toàn với BẬC ở trên: một người có thể đang `registering` ở tuyến gói (mua gói
 * trước khi xe kịp lên chợ), và một chủ xe `owner` đầy đủ vẫn ở tuyến hoa hồng suốt đời nếu
 * không mua gì. Hai câu hỏi khác nhau, đừng gộp — đúng kỷ luật ADR 0027 điều 2 đặt cho quyền
 * và gói.
 */
export function isCommissionTrack(
  tenant: (OwnerStageInput & { billingMode?: string | null }) | null | undefined,
): boolean {
  return (
    tenant?.roleKey === TENANT_ROLE.SHOP_OWNER && tenant.billingMode !== BILLING_MODE.PACKAGE
  );
}

/**
 * ── HAI CÂU HỎI, TÁCH RA (15/09/2026) ───────────────────────────────────────────────────────
 *
 * `isCommissionTrack` ở trên trả lời "người này có phải CHỦ XE tuyến hoa hồng không" — nó hỏi cả
 * vai lẫn tuyến. Cổng `/manage` từng dùng chính nó, và đó là lỗi: điều kiện `roleKey ===
 * shop_owner` khiến hàm trả `false` cho quản lý/nhân viên/người xem, nên `canUseManagePortal`
 * cho họ vào Manage của **mọi** gian hàng — kể cả gian hàng tuyến hoa hồng và gian hàng đã hết
 * gói. Docblock của `resolveWorkspaceHref` còn ghi hẳn điều đó ra như một quy tắc.
 *
 * Hai hàm dưới đây hỏi đúng MỘT chuyện mỗi hàm:
 *
 *   tenantUsesManagePortal   — GIAN HÀNG này có bộ quản lý đầy đủ không?  (thuộc tính của TENANT)
 *   isCommissionOwnerAccount — NGƯỜI này là chủ xe Owner Lite không?      (vai + tuyến)
 *
 * Câu thứ nhất không hỏi vai, nên nó áp cho mọi thành viên: hết gói thì cả gian hàng ra khỏi
 * Manage, không ai ở lại chỉ vì `roleKey` của họ khác `shop_owner`.
 */

/** Tenant đang mang thuê bao hiệu lực (kể cả trong ÂN HẠN) ⇒ được dùng `/manage`. */
export function tenantUsesManagePortal(
  tenant: { billingMode?: string | null } | null | undefined,
): boolean {
  return tenant?.billingMode === BILLING_MODE.PACKAGE;
}

/**
 * Người này là CHỦ XE tuyến hoa hồng — làm việc ở Owner Lite trong `/account`.
 *
 * Khác `tenantUsesManagePortal` ở chỗ nó hỏi thêm VAI: nhân viên của một gian hàng tuyến hoa
 * hồng không phải chủ xe, họ chỉ là một con người có tài khoản (và menu `/account` của họ là
 * menu khách thuê).
 */
export function isCommissionOwnerAccount(
  tenant: (OwnerStageInput & { billingMode?: string | null }) | null | undefined,
): boolean {
  return tenant?.roleKey === TENANT_ROLE.SHOP_OWNER && !tenantUsesManagePortal(tenant);
}
