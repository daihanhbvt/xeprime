import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';
import { uploadsApi, type UploadMeta, type UploadPresign } from '../uploads/api';

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

/**
 * Chính sách thuê sống ở `../rental-policies` — MỘT chủ sở hữu cho một khái niệm.
 *
 * Re-export ở đây vì giá theo xe KẾ THỪA từ nó (`VehiclePricingDto.shopPolicy`), nên nơi đọc giá
 * xe cũng cần kiểu đó ngay trong tầm tay. Khai lại `Schemas[...]` lần hai thì hai bí danh sẽ trôi
 * khỏi nhau đúng vào ngày backend đổi tên DTO.
 */
export type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  ShopRentalPolicy,
} from '../rental-policies/api';

/**
 * Presign ảnh công khai sống ở `../uploads` — nó phục vụ CẢ ảnh xe lẫn logo/ảnh bìa gian hàng,
 * nên nó không thuộc về feature nào trong hai. Re-export ở đây để nơi gọi `presignImage` có sẵn
 * kiểu trong tầm tay.
 */
export type { UploadMeta, UploadPresign } from '../uploads/api';

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

  /** Presign ảnh xe — chuyển tiếp cho `uploadsApi`, chủ sở hữu của mọi đường presign công khai. */
  presignImage(meta: UploadMeta): Promise<UploadPresign> {
    return uploadsApi.vehicleImage(meta);
  },
};
