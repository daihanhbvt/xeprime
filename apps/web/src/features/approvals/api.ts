import {
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  type ApprovalDecision,
  type PaginationMeta,
} from '@xeprime/types';
import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import { startOfAppDay } from '@/lib/datetime';
import { apiGet, apiPost, apiPut, apiRequest, type QueryParams } from '@/services/api-client';
import { APPROVAL_STATUS_ANY } from './constants';
import type {
  VehicleApprovalCheck,
  VehicleApprovalCounts,
  VehicleApprovalDetail,
  VehicleApprovalFilters,
  VehicleApprovalInternalNote,
  VehicleApprovalRow,
} from './types';

export const VEHICLE_APPROVALS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

/**
 * Mặc định của hàng đợi: phiếu CHỜ duyệt — đó là việc phải làm, không phải toàn bộ lịch sử.
 * `'all'` ở URL là lựa chọn tường minh "xem mọi trạng thái".
 */
export const VEHICLE_APPROVALS_DEFAULT_STATUS = APPROVAL_STATUS.PENDING;

const BASE = '/platform/vehicle-approvals';

const EMPTY_COUNTS: VehicleApprovalCounts = { all: 0, car: 0, motorbike: 0 };

export interface VehicleApprovalListResult {
  items: VehicleApprovalRow[];
  meta: PaginationMeta;
  counts: VehicleApprovalCounts;
}

/**
 * Bộ lọc → tham số `GET /platform/vehicle-approvals`. Mọi chiều đi lên SERVER — không chiều nào
 * được lọc trên một trang đã cắt ở client.
 *
 * Ngày gửi: `FilterBar` ghi NGÀY theo giờ Việt Nam; server nhận MỐC, nên "đến ngày X" là hết
 * ngày X (00:00 hôm sau trừ 1ms), không phải 00:00 của chính ngày đó.
 */
export function filtersToParams(filters: VehicleApprovalFilters): QueryParams {
  return {
    status: filters.status === APPROVAL_STATUS_ANY ? null : pickFilter(filters.status),
    vehicleType: pickFilter(filters.vehicleType),
    storefrontKind: pickFilter(filters.storefrontKind),
    q: filters.q?.trim() || null,
    submittedFrom: filters.submittedFrom
      ? startOfAppDay(filters.submittedFrom).toISOString()
      : null,
    submittedTo: filters.submittedTo
      ? startOfAppDay(filters.submittedTo).add(1, 'day').subtract(1, 'millisecond').toISOString()
      : null,
    page: filters.page ?? 1,
    limit: filters.limit ?? VEHICLE_APPROVALS_DEFAULT_LIMIT,
  };
}

/**
 * Envelope riêng: ngoài `data`/`meta` còn mang `counts` cho ba tab loại xe. Số trên tab và danh
 * sách đến từ CÙNG một lần đọc — tách ra request thứ hai là mở đường cho tab "Ô tô (3)" trong khi
 * danh sách hiện hai dòng.
 */
interface VehicleApprovalEnvelope {
  data: VehicleApprovalRow[];
  meta?: PaginationMeta;
  counts?: VehicleApprovalCounts;
}

export async function fetchVehicleApprovals(
  filters: VehicleApprovalFilters,
): Promise<VehicleApprovalListResult> {
  const params = filtersToParams(filters);
  const res = (await apiRequest<VehicleApprovalRow[]>(BASE, {
    query: params,
  })) as VehicleApprovalEnvelope;
  return {
    items: res.data,
    meta: res.meta ?? {
      page: 1,
      limit: VEHICLE_APPROVALS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
    counts: res.counts ?? EMPTY_COUNTS,
  };
}

export const fetchVehicleApproval = (id: string): Promise<VehicleApprovalDetail> =>
  apiGet<VehicleApprovalDetail>(`${BASE}/${id}`);

export const setVehicleApprovalCheck = (
  id: string,
  checkKey: string,
  passed: boolean,
): Promise<{ items: VehicleApprovalCheck[] }> =>
  apiPut<{ items: VehicleApprovalCheck[] }>(`${BASE}/${id}/checks/${checkKey}`, { passed });

export const saveVehicleApprovalNote = (
  id: string,
  note: string,
  expectedUpdatedAt: string | null,
): Promise<VehicleApprovalInternalNote> =>
  apiPut<VehicleApprovalInternalNote>(`${BASE}/${id}/internal-note`, { note, expectedUpdatedAt });

const DECISION_PATH: Record<ApprovalDecision, string> = {
  [APPROVAL_DECISION.APPROVE]: 'approve',
  [APPROVAL_DECISION.REJECT]: 'reject',
  [APPROVAL_DECISION.REQUEST_REVISION]: 'request-revision',
};

/**
 * Ba quyết định, mỗi quyết định một body khác nhau:
 *
 *  - **Phê duyệt** mang `expectedCapturedAt` — mốc của snapshot đang hiện trên màn. Chủ xe sửa xe
 *    lúc phiếu còn chờ thì snapshot được dựng lại (24/09/2026), nên một màn mở lâu có thể đang
 *    trưng bản cũ; máy chủ trả `APPROVAL_SNAPSHOT_STALE` thay vì duyệt nhầm.
 *  - **Từ chối / yêu cầu bổ sung** mang lý do. Không cần khoá: cả hai trả hồ sơ về cho chủ xe, nên
 *    quyết định trên bản cũ hay mới đều dẫn tới cùng một chỗ.
 */
export const decideVehicleApproval = (
  id: string,
  kind: ApprovalDecision,
  reason?: string,
  expectedCapturedAt?: string,
): Promise<VehicleApprovalDetail> =>
  apiPost<VehicleApprovalDetail>(
    `${BASE}/${id}/${DECISION_PATH[kind]}`,
    kind === APPROVAL_DECISION.APPROVE ? { expectedCapturedAt } : { reason },
  );
