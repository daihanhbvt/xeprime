import type { PaginationMeta } from '@xeprime/types';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  apiRequest,
  type QueryParams,
} from '@/services/api-client';
import type {
  CreateVehicleInput,
  FleetSummary,
  SaveVehicleSourceInput,
  SourceContractDownload,
  SourceContractPresign,
  UpdateVehicleInput,
  Vehicle360Summary,
  VehicleDetail,
  VehicleFilters,
  VehicleAlertGroup,
  VehicleListItem,
  VehicleSource,
  VehicleSourceContractFile,
  VehicleStats,
} from './types';

export const VEHICLES_DEFAULT_LIMIT = 20;

export interface VehicleListResult {
  items: VehicleListItem[];
  meta: PaginationMeta;
}

/** Filter (URL) → query params gửi API. Bỏ giá trị rỗng để URL và cache key gọn. */
export function filtersToParams(filters: VehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    operationStatus: filters.operationStatus ?? null,
    publicStatus: filters.publicStatus ?? null,
    branchId: filters.branchId ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? VEHICLES_DEFAULT_LIMIT,
  };
}

export async function fetchVehicles(filters: VehicleFilters): Promise<VehicleListResult> {
  const params = filtersToParams(filters);
  const res = await apiRequest<VehicleListItem[]>('/vehicles', { query: params });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: VEHICLES_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchVehicle = (id: string): Promise<VehicleDetail> =>
  apiGet<VehicleDetail>(`/vehicles/${id}`);

export const createVehicle = (body: CreateVehicleInput): Promise<VehicleDetail> =>
  apiPost<VehicleDetail>('/vehicles', body);

export const updateVehicle = (id: string, body: UpdateVehicleInput): Promise<VehicleDetail> =>
  apiPatch<VehicleDetail>(`/vehicles/${id}`, body);

export const deleteVehicle = (id: string): Promise<{ id: string }> =>
  apiDelete<{ id: string }>(`/vehicles/${id}`);

/** Gửi xe đi duyệt công khai (ADR 0008) — backend tạo phiếu duyệt, không tự set approved_public. */
export const submitVehiclePublic = (id: string): Promise<VehicleDetail> =>
  apiPost<VehicleDetail>(`/vehicles/${id}/submit-public`, {});

/**
 * Chỉ số cho thẻ xe — gọi RIÊNG, sau khi đã có trang danh sách.
 *
 * Tách khỏi `fetchVehicles` để danh sách hiện ngay: tổng hợp thu/chi chậm hơn truy vấn xe, gộp
 * chung sẽ bắt cả trang chờ theo phần chậm nhất. Thống kê hỏng cũng không kéo sập danh sách.
 */
export async function fetchVehicleStats(ids: string[]): Promise<VehicleStats[]> {
  if (ids.length === 0) return [];
  const res = await apiRequest<VehicleStats[]>('/vehicles/stats', {
    query: { ids: ids.join(',') },
  });
  return res.data;
}

/**
 * Việc cần làm + KM hiện tại theo lô xe (Wave 8).
 *
 * Cùng endpoint/service với Hồ sơ 360 — cảnh báo là thứ người vận hành hành động theo, hai
 * phép tính song song là hai quyết định sai. Tách khỏi `fetchVehicles` cùng lý do với `stats`.
 */
export async function fetchVehicleAlerts(ids: string[]): Promise<VehicleAlertGroup[]> {
  if (ids.length === 0) return [];
  const res = await apiRequest<VehicleAlertGroup[]>('/vehicles/alerts', {
    query: { ids: ids.join(',') },
  });
  return res.data;
}

/** Đếm đội xe theo trạng thái vận hành — nói về CẢ đội xe, không theo trang/bộ lọc. */
export const fetchFleetSummary = (): Promise<FleetSummary> =>
  apiGet<FleetSummary>('/vehicles/fleet-summary');

/**
 * Tổng hợp Hồ sơ 360 của một xe — MỘT request cho chỉ số + đơn sắp tới + hoạt động gần đây.
 * Khối nào người gọi không có quyền xem thì backend đã bỏ khỏi response (không phải FE tự ẩn).
 */
export const fetchVehicleSummary = (id: string): Promise<Vehicle360Summary> =>
  apiGet<Vehicle360Summary>(`/vehicles/${id}/summary`);

/** Hồ sơ nguồn xe & tài chính (Wave 4) — GET cần `finance.view`, PUT thêm `vehicles.update`. */
export const fetchVehicleSource = (id: string): Promise<VehicleSource> =>
  apiGet<VehicleSource>(`/vehicles/${id}/source`);

export const saveVehicleSource = (
  id: string,
  body: SaveVehicleSourceInput,
): Promise<VehicleSource> => apiPut<VehicleSource>(`/vehicles/${id}/source`, body);

/**
 * Hợp đồng nguồn xe là TÀI LIỆU RIÊNG TƯ (Wave 4.1): presign gắn với xe, PUT vào bucket
 * riêng tư, hoàn tất để server xác minh, tải về qua signed URL ngắn hạn phát sau kiểm quyền.
 * Không có URL nào được lưu ở form hay DB.
 */
export const presignSourceContract = (
  vehicleId: string,
  file: File,
): Promise<SourceContractPresign> =>
  apiPost<SourceContractPresign>(`/vehicles/${vehicleId}/source/contracts/presign`, {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });

export const completeSourceContract = (
  vehicleId: string,
  fileId: string,
): Promise<VehicleSourceContractFile> =>
  apiPost<VehicleSourceContractFile>(
    `/vehicles/${vehicleId}/source/contracts/${fileId}/complete`,
    {},
  );

export const fetchSourceContractDownload = (
  vehicleId: string,
  fileId: string,
): Promise<SourceContractDownload> =>
  apiGet<SourceContractDownload>(`/vehicles/${vehicleId}/source/contracts/${fileId}/download`);
