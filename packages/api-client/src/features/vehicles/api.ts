import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type VehicleListItem = Schemas['VehicleListItemDto'];
export type VehicleDetail = Schemas['VehicleDetailDto'];
export type CreateVehicleInput = Schemas['CreateVehicleDto'];
export type UpdateVehicleInput = Schemas['UpdateVehicleDto'];
export type VehicleStats = Schemas['VehicleStatsDto'];
export type FleetSummary = Schemas['FleetSummaryDto'];
export type Vehicle360Summary = Schemas['Vehicle360SummaryDto'];
export type VehicleAlertGroup = Schemas['VehicleAlertsDto'];
export type VehicleAlertItem = Schemas['VehicleAlertDto'];
export type VehicleBookingBrief = Schemas['VehicleBookingBriefDto'];
export type VehicleSource = Schemas['VehicleSourceDto'];
export type VehicleSourceDetail = Schemas['VehicleSourceDetailDto'];
export type VehicleSourceContractFile = Schemas['VehicleSourceContractFileDto'];
export type SaveVehicleSourceInput = Schemas['SaveVehicleSourceDto'];
export type SourceContractPresign = Schemas['SourceContractPresignDto'];
export type SourceContractDownload = Schemas['SourceContractDownloadDto'];
export type VehiclePricing = Schemas['VehiclePricingDto'];
export type SaveVehiclePricingInput = Schemas['SaveVehiclePricingDto'];
export type ShopRentalPolicy = Schemas['ShopRentalPolicyDto'];
export type SaveRentalPolicyInput = Schemas['SaveRentalPolicyDto'];
export type RentalPolicyValues = Schemas['RentalPolicyValuesDto'];
export type UploadPresign = Schemas['UploadPresignDto'];

/** Metadata một tệp sắp tải lên. `fileSize` là số byte SẼ GỬI — server ký nó vào URL. */
export interface UploadMeta {
  fileName: string;
  contentType: string;
  fileSize: number;
}

/** Khớp `VEHICLE_SORT` ở backend DTO. */
export type VehicleSort = 'newest' | 'name_asc' | 'code_asc' | 'price_asc' | 'price_desc';

export interface VehicleFilters {
  q?: string;
  vehicleType?: string;
  serviceType?: string;
  operationStatus?: string;
  publicStatus?: string;
  branchId?: string;
  sort?: VehicleSort;
  page?: number;
  limit?: number;
}

export const VEHICLES_DEFAULT_LIMIT = 20;

export function vehicleFiltersToParams(filters: VehicleFilters): QueryParams {
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

/**
 * Đội xe của GIAN HÀNG.
 *
 * `tenant_id` KHÔNG bao giờ là tham số: backend lấy từ membership (CLAUDE.md mục 5). Client cũng
 * không tự đặt `approved_public` — lên chợ phải đi qua `submitPublic` (ADR 0008).
 */
export const vehiclesApi = {
  list(filters: VehicleFilters): Promise<Paged<VehicleListItem>> {
    return getApiClient().fetchPage<VehicleListItem>(
      '/vehicles',
      vehicleFiltersToParams(filters),
      VEHICLES_DEFAULT_LIMIT,
    );
  },

  /**
   * Chỉ số của các xe đang hiện trên trang — gọi RIÊNG sau khi đã có danh sách.
   *
   * Tách khỏi `list` để danh sách hiện ngay: tổng hợp thu/chi chậm hơn truy vấn xe, gộp chung sẽ
   * bắt cả trang chờ theo phần chậm nhất. Thống kê hỏng cũng không kéo sập danh sách.
   */
  stats(ids: readonly string[]): Promise<VehicleStats[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return getApiClient().get<VehicleStats[]>('/vehicles/stats', { ids: ids.join(',') });
  },

  /** Việc cần làm + KM hiện tại theo lô xe — cùng service với Hồ sơ 360, không tính lại ở client. */
  alerts(ids: readonly string[]): Promise<VehicleAlertGroup[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return getApiClient().get<VehicleAlertGroup[]>('/vehicles/alerts', { ids: ids.join(',') });
  },

  /** Đếm đội xe theo trạng thái vận hành — nói về CẢ đội xe, không theo trang/bộ lọc. */
  fleetSummary(): Promise<FleetSummary> {
    return getApiClient().get<FleetSummary>('/vehicles/fleet-summary');
  },

  detail(id: string): Promise<VehicleDetail> {
    return getApiClient().get<VehicleDetail>(`/vehicles/${encodeURIComponent(id)}`);
  },

  /**
   * Tổng hợp Hồ sơ 360 — MỘT request cho chỉ số + đơn sắp tới + hoạt động gần đây.
   * Khối nào người gọi không có quyền xem thì backend đã bỏ khỏi response.
   */
  summary(id: string): Promise<Vehicle360Summary> {
    return getApiClient().get<Vehicle360Summary>(`/vehicles/${encodeURIComponent(id)}/summary`);
  },

  create(body: CreateVehicleInput): Promise<VehicleDetail> {
    return getApiClient().post<VehicleDetail>('/vehicles', body);
  },

  update(id: string, body: UpdateVehicleInput): Promise<VehicleDetail> {
    return getApiClient().patch<VehicleDetail>(`/vehicles/${encodeURIComponent(id)}`, body);
  },

  remove(id: string): Promise<{ id: string }> {
    return getApiClient().delete<{ id: string }>(`/vehicles/${encodeURIComponent(id)}`);
  },

  /** Gửi xe đi duyệt công khai (ADR 0008) — backend tạo phiếu duyệt. */
  submitPublic(id: string): Promise<VehicleDetail> {
    return getApiClient().post<VehicleDetail>(
      `/vehicles/${encodeURIComponent(id)}/submit-public`,
      {},
    );
  },

  /** Hồ sơ nguồn xe & tài chính — GET cần `finance.view`, PUT thêm `vehicles.update`. */
  source(id: string): Promise<VehicleSource> {
    return getApiClient().get<VehicleSource>(`/vehicles/${encodeURIComponent(id)}/source`);
  },

  saveSource(id: string, body: SaveVehicleSourceInput): Promise<VehicleSource> {
    return getApiClient().put<VehicleSource>(`/vehicles/${encodeURIComponent(id)}/source`, body);
  },

  /**
   * Hợp đồng nguồn xe là TÀI LIỆU RIÊNG TƯ: presign gắn với xe → PUT vào bucket riêng tư →
   * hoàn tất để server xác minh → tải về qua signed URL ngắn hạn phát sau khi kiểm quyền.
   * Không URL nào được lưu ở form hay DB.
   */
  presignSourceContract(id: string, meta: UploadMeta): Promise<SourceContractPresign> {
    return getApiClient().post<SourceContractPresign>(
      `/vehicles/${encodeURIComponent(id)}/source/contracts/presign`,
      meta,
    );
  },

  completeSourceContract(id: string, fileId: string): Promise<VehicleSourceContractFile> {
    return getApiClient().post<VehicleSourceContractFile>(
      `/vehicles/${encodeURIComponent(id)}/source/contracts/${encodeURIComponent(fileId)}/complete`,
      {},
    );
  },

  sourceContractDownload(id: string, fileId: string): Promise<SourceContractDownload> {
    return getApiClient().get<SourceContractDownload>(
      `/vehicles/${encodeURIComponent(id)}/source/contracts/${encodeURIComponent(fileId)}/download`,
    );
  },

  /** Giá & chính sách theo XE — kế thừa gian hàng hoặc ghi đè riêng. */
  pricing(id: string): Promise<VehiclePricing> {
    return getApiClient().get<VehiclePricing>(`/vehicles/${encodeURIComponent(id)}/pricing`);
  },

  savePricing(id: string, body: SaveVehiclePricingInput): Promise<VehiclePricing> {
    return getApiClient().put<VehiclePricing>(`/vehicles/${encodeURIComponent(id)}/pricing`, body);
  },

  /** Chính sách mặc định của gian hàng — tách theo LOẠI XE, nên luôn truyền `vehicleType`. */
  shopPolicy(vehicleType: string): Promise<ShopRentalPolicy> {
    return getApiClient().get<ShopRentalPolicy>('/shop/rental-policies', { vehicleType });
  },

  /**
   * Presign ảnh xe (đại diện/gallery) lên R2 — client PUT thẳng, nhị phân không đi qua API.
   *
   * `fileSize` được server ký vào URL (`content-length` nằm trong `X-Amz-SignedHeaders`), nên
   * số khai ở đây phải khớp TUYỆT ĐỐI số byte lúc PUT, nếu không R2 trả 403.
   */
  presignImage(meta: UploadMeta): Promise<UploadPresign> {
    return getApiClient().post<UploadPresign>('/uploads/vehicle-images/presign', meta);
  },
};
