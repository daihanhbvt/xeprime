import {
  BILLING_MODE,
  PLAN_STATUS,
  PLAN_VEHICLE_SCOPE,
  normalizeCatalogSearch,
  planVehicleScopeOf,
  type PlanStatus,
} from '@xeprime/types';
import type { Plan } from './types';

/**
 * LOẠI GÓI trên màn quản trị — một phân loại TRÌNH BÀY, suy từ dữ liệu của bậc, không lưu ở đâu.
 *
 * Ba loại chứ không phải hai chế độ thu phí: bậc gói `salesOnly` (ADR 0041 điều 5) cùng
 * `billingMode = package` với bậc tự mua, nhưng với admin nó là một thứ khác hẳn — không có giá
 * niêm yết, bán bằng tư vấn. Gộp nó vào "gói" là để một hàng "Liên hệ báo giá" lẫn giữa các hàng
 * có giá, và bộ lọc "Loại gói" không tách được nó ra.
 */
export const PLAN_KIND = {
  COMMISSION: 'commission',
  PACKAGE: 'package',
  SALES_ONLY: 'sales_only',
} as const;

export type PlanKind = (typeof PLAN_KIND)[keyof typeof PLAN_KIND];

export const PLAN_KIND_VALUES = Object.values(PLAN_KIND) as PlanKind[];

export function planKindOf(plan: Pick<Plan, 'billingMode' | 'limits'>): PlanKind {
  if (plan.billingMode === BILLING_MODE.COMMISSION) return PLAN_KIND.COMMISSION;
  return plan.limits.salesOnly ? PLAN_KIND.SALES_ONLY : PLAN_KIND.PACKAGE;
}

/** Độ dài tối đa của mã gói — khớp `@Matches` ở `CreatePlanDto` và cột `plans.code` (50). */
export const PLAN_CODE_MAX_LENGTH = 50;

/**
 * Chuẩn hoá chuỗi gõ vào ô MÃ GÓI — chạy ở MỖI phím gõ, để người dùng thấy đúng thứ sẽ được lưu.
 *
 * Mã gói là định danh, và unique ở DB PHÂN BIỆT hoa/thường: cho lưu chữ hoa là để "XX003" và
 * "xx003" thành hai gói khác nhau. Nên thay vì từ chối chữ hoa, form nhận mọi thứ rồi đưa về
 * dạng chuẩn: bỏ dấu tiếng Việt, chữ thường, khoảng trắng thành "-", bỏ ký tự lạ, không để "-"/"_"
 * đứng đầu ("Gói VIP 1" → "goi-vip-1"). Backend cũng hạ chữ thường — đây chỉ là phần hiển thị.
 *
 * Gạch ở CUỐI được giữ: người dùng đang gõ dở "shop-" để gõ tiếp. Schema của form cắt nó lúc gửi.
 */
export function toPlanCode(raw: string): string {
  return normalizeCatalogSearch(raw.replace(/\s+/g, '-'))
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[-_]+/, '')
    .slice(0, PLAN_CODE_MAX_LENGTH);
}

/**
 * NHÓM của một bậc trên màn quản trị — theo PHẠM VI loại xe (ADR 0065), cộng tuyến hoa hồng.
 *
 * Bốn nhóm, đúng bốn câu hỏi admin đặt ra khi mở màn này: bán gì cho xe máy, bán gì cho ô tô, bậc
 * doanh nghiệp (phạm vi `all`, thường bán qua tư vấn) ra sao, và tuyến vào cửa. Nhóm suy từ dữ
 * liệu của bậc (`billingMode` + `vehicleScope`), không lưu ở đâu.
 */
export const PLAN_GROUP = {
  MOTORBIKE: 'motorbike',
  CAR: 'car',
  ENTERPRISE: 'enterprise',
  COMMISSION: 'commission',
} as const;
export type PlanGroup = (typeof PLAN_GROUP)[keyof typeof PLAN_GROUP];
/** Thứ tự hiển thị — cùng thứ tự `GET /subscription/plan-catalog` (xe máy → ô tô → doanh nghiệp). */
export const PLAN_GROUP_ORDER: readonly PlanGroup[] = [
  PLAN_GROUP.MOTORBIKE,
  PLAN_GROUP.CAR,
  PLAN_GROUP.ENTERPRISE,
  PLAN_GROUP.COMMISSION,
];

export function planGroupOf(plan: Pick<Plan, 'billingMode' | 'vehicleScope'>): PlanGroup {
  if (plan.billingMode === BILLING_MODE.COMMISSION) return PLAN_GROUP.COMMISSION;
  const scope = planVehicleScopeOf(plan.vehicleScope);
  if (scope === PLAN_VEHICLE_SCOPE.MOTORBIKE) return PLAN_GROUP.MOTORBIKE;
  if (scope === PLAN_VEHICLE_SCOPE.CAR) return PLAN_GROUP.CAR;
  return PLAN_GROUP.ENTERPRISE;
}

export interface PlanGroupRows {
  group: PlanGroup;
  plans: Plan[];
}

/** Chia danh sách (đã lọc) thành các nhóm KHÔNG rỗng, theo `PLAN_GROUP_ORDER`; giữ thứ tự trong nhóm. */
export function groupPlans(plans: readonly Plan[]): PlanGroupRows[] {
  return PLAN_GROUP_ORDER.map((group) => ({
    group,
    plans: plans.filter((plan) => planGroupOf(plan) === group),
  })).filter((row) => row.plans.length > 0);
}

/**
 * BA SỔ của danh mục, theo trạng thái bậc: đang bán (mặc định), CHƯA MỞ BÁN (`draft` — bậc mới tạo
 * hoặc sáu bậc seed của ADR 0065 chờ admin nhập giá rồi mở bán) và ĐÃ NGỪNG (`archived` — gồm ba
 * bậc ADR 0041 đã nghỉ hưu, còn thuê bao lịch sử trỏ tới). Là một VIEW, không phải bộ lọc: mặc định
 * không được thắp "Lọc 1", và bậc chưa bán / đã ngừng không được lẫn vào bảng đang bán.
 */
export const PLAN_CATALOG_VIEW = {
  SELLING: 'selling',
  DRAFT: 'draft',
  RETIRED: 'retired',
} as const;
export type PlanCatalogView = (typeof PLAN_CATALOG_VIEW)[keyof typeof PLAN_CATALOG_VIEW];

/** Sổ → trạng thái bậc được hiện trong sổ đó. */
const VIEW_STATUS: Readonly<Record<PlanCatalogView, PlanStatus>> = {
  [PLAN_CATALOG_VIEW.SELLING]: PLAN_STATUS.ACTIVE,
  [PLAN_CATALOG_VIEW.DRAFT]: PLAN_STATUS.DRAFT,
  [PLAN_CATALOG_VIEW.RETIRED]: PLAN_STATUS.ARCHIVED,
};

/** Bộ lọc của bảng gói — tham số URL (ADR 0004): `q`, `kind`, và view `view`. */
export interface PlanCatalogFilters {
  q?: string;
  kind?: PlanKind;
  /** `undefined` = đang bán (mặc định, không ghi lên URL). */
  view?: typeof PLAN_CATALOG_VIEW.DRAFT | typeof PLAN_CATALOG_VIEW.RETIRED;
}

/**
 * Đọc bộ lọc từ URL. Giá trị lạ (link cũ, gõ tay) rơi về "không lọc" thay vì lọt vào phép so.
 * Link cũ `?status=archived` / `?status=draft` vẫn mở đúng sổ.
 */
export function parsePlanCatalogFilters(params: URLSearchParams): PlanCatalogFilters {
  const q = params.get('q')?.trim() || undefined;
  const kind = params.get('kind');
  const view = params.get('view');
  const status = params.get('status');
  return {
    q,
    kind: PLAN_KIND_VALUES.includes(kind as PlanKind) ? (kind as PlanKind) : undefined,
    view:
      view === PLAN_CATALOG_VIEW.RETIRED || status === PLAN_STATUS.ARCHIVED
        ? PLAN_CATALOG_VIEW.RETIRED
        : view === PLAN_CATALOG_VIEW.DRAFT || status === PLAN_STATUS.DRAFT
          ? PLAN_CATALOG_VIEW.DRAFT
          : undefined,
  };
}

/** View không phải bộ lọc — chỉ `q` và `kind` thắp trạng thái "đang lọc". */
export function hasActivePlanFilters(filters: PlanCatalogFilters): boolean {
  return Boolean(filters.q || filters.kind);
}

/**
 * Lọc danh mục ở CLIENT — cố ý, không phải thiếu sót.
 *
 * `GET /platform/plans` trả trọn danh mục (chục bậc, không phân trang — ngoại lệ đã ghi ở
 * `DataTable`), và thẻ số liệu đầu trang cần chính tập đầy đủ đó. Gọi lại server cho mỗi phím gõ
 * để lọc chục dòng là tốn một vòng mạng mà không đổi được gì.
 *
 * Tìm không dấu (`normalizeCatalogSearch`): "goi co ban" phải ra "Gói cơ bản".
 */
export function filterPlans(plans: readonly Plan[], filters: PlanCatalogFilters): Plan[] {
  const needle = filters.q ? normalizeCatalogSearch(filters.q) : '';
  const wanted = VIEW_STATUS[filters.view ?? PLAN_CATALOG_VIEW.SELLING];
  return plans.filter((plan) => {
    if (plan.status !== wanted) return false;
    if (filters.kind && planKindOf(plan) !== filters.kind) return false;
    if (!needle) return true;
    return [plan.name, plan.code, plan.description ?? ''].some((text) =>
      normalizeCatalogSearch(text).includes(needle),
    );
  });
}

export interface PlanCatalogSummary {
  total: number;
  active: number;
  archived: number;
  /**
   * Tổng lượt gán/mua GÓI GIAN HÀNG — kể cả gia hạn và thuê bao đã kết thúc, nhưng KHÔNG kể tuyến
   * hoa hồng: mỗi gian hàng mới được `assignDefaultPlanWithinTx` gán tự động một dòng 0đ vào
   * tuyến đó, nên cộng nó vào là biến con số đầu trang thành "số gian hàng từng mở" — và nó sẽ bị
   * đọc như doanh số bán gói.
   */
  subscriptions: number;
}

/** Số liệu đầu trang — luôn trên TOÀN danh mục, không theo bộ lọc đang bật. */
export function summarizePlans(plans: readonly Plan[]): PlanCatalogSummary {
  return plans.reduce<PlanCatalogSummary>(
    (acc, plan) => ({
      total: acc.total + 1,
      active: acc.active + (plan.status === PLAN_STATUS.ACTIVE ? 1 : 0),
      archived: acc.archived + (plan.status === PLAN_STATUS.ARCHIVED ? 1 : 0),
      subscriptions:
        acc.subscriptions +
        (planKindOf(plan) === PLAN_KIND.COMMISSION ? 0 : plan.subscriptionCount),
    }),
    { total: 0, active: 0, archived: 0, subscriptions: 0 },
  );
}

/**
 * Giá "đầu bảng" của một bậc gói — con số lớn trên hàng.
 *
 * Kỳ 1 tháng nếu bậc bán kỳ đó (đọc được như một giá tháng); không thì kỳ NGẮN NHẤT đang bán,
 * kèm số tháng của nó — "450.000 ₫ / tháng" cho một bậc chỉ bán kỳ 6 tháng là nói sai sáu lần.
 * `null` khi bậc chưa khai bảng giá.
 */
export function headlineTerm(plan: Pick<Plan, 'limits'>): { months: number; price: string } | null {
  const terms = [...plan.limits.termPrices].sort((a, b) => a.months - b.months);
  return terms[0] ?? null;
}

/**
 * Bậc CHƯA MỞ BÁN mở bán được chưa — bậc tự mua phải có ít nhất một kỳ giá (ADR 0041 điều 2:
 * `termPrices` là danh sách kỳ được bán; rỗng = gian hàng không mua được gì). Bậc tư vấn
 * (`salesOnly`) không cần giá niêm yết. Server vẫn là lớp chặn thật.
 */
export function planReadyToPublish(plan: Pick<Plan, 'billingMode' | 'limits'>): boolean {
  if (plan.billingMode === BILLING_MODE.COMMISSION) return true;
  return plan.limits.salesOnly || plan.limits.termPrices.length > 0;
}
