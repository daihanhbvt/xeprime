import {
  BILLING_MODE,
  OWNER_LITE_FEATURES,
  PLAN_FEATURE,
  PLAN_STATUS,
  PLAN_STATUS_VALUES,
  normalizeCatalogSearch,
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

/**
 * Trần chi nhánh của tuyến hoa hồng — HỆ QUẢ, không phải một núm vặn, nên nó được SUY RA chứ
 * không viết số: backend không có con số nào cho nó (`branchQuotaFor` trả `null` ngoài tuyến
 * gói); thứ chặn thật là cờ `branches` vắng mặt trong `OWNER_LITE_FEATURES`, để lại đúng chi
 * nhánh mặc định. Ngày tập cờ đó có `branches`, câu trả lời ở đây tự đổi theo (`null` = không
 * giới hạn).
 *
 * Hiện nó cạnh `OWNER_LITE_VEHICLE_LIMIT` để admin không phải đi tìm; `limits_json` của bậc đó
 * để null ở mọi trần, và in "Không giới hạn" từ đó là nói ngược hẳn với thứ backend chặn
 * (ADR 0041 điều 4).
 */
export const COMMISSION_TRACK_BRANCH_LIMIT: number | null = OWNER_LITE_FEATURES.includes(
  PLAN_FEATURE.BRANCHES,
)
  ? null
  : 1;
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

/** Bộ lọc của bảng gói — ba tham số URL (ADR 0004): `q`, `kind`, `status`. */
export interface PlanCatalogFilters {
  q?: string;
  kind?: PlanKind;
  status?: PlanStatus;
}

/**
 * Đọc bộ lọc từ URL. Giá trị lạ (link cũ, gõ tay) rơi về "không lọc" thay vì lọt vào phép so —
 * một `?status=foo` không được biến bảng thành rỗng với câu "không có gói nào khớp".
 */
export function parsePlanCatalogFilters(params: URLSearchParams): PlanCatalogFilters {
  const q = params.get('q')?.trim() || undefined;
  const kind = params.get('kind');
  const status = params.get('status');
  return {
    q,
    kind: PLAN_KIND_VALUES.includes(kind as PlanKind) ? (kind as PlanKind) : undefined,
    status: PLAN_STATUS_VALUES.includes(status as PlanStatus) ? (status as PlanStatus) : undefined,
  };
}

export function hasActivePlanFilters(filters: PlanCatalogFilters): boolean {
  return Boolean(filters.q || filters.kind || filters.status);
}

/**
 * Lọc danh mục ở CLIENT — cố ý, không phải thiếu sót.
 *
 * `GET /platform/plans` trả trọn danh mục (vài bậc, không phân trang — ngoại lệ đã ghi ở
 * `DataTable`), và thẻ số liệu đầu trang cần chính tập đầy đủ đó. Gọi lại server cho mỗi phím gõ
 * để lọc năm dòng là tốn một vòng mạng mà không đổi được gì.
 *
 * Tìm không dấu (`normalizeCatalogSearch`): "goi co ban" phải ra "Gói cơ bản".
 */
export function filterPlans(plans: readonly Plan[], filters: PlanCatalogFilters): Plan[] {
  const needle = filters.q ? normalizeCatalogSearch(filters.q) : '';
  return plans.filter((plan) => {
    if (filters.kind && planKindOf(plan) !== filters.kind) return false;
    if (filters.status && plan.status !== filters.status) return false;
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
