import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  AssignableDriver,
  Driver,
  DriverAssignmentRow,
  DriverFilters,
  DriverOverview,
  DriverWageSettings,
  UpdateDriverWageSettingsInput,
  InviteDriverInput,
  UpdateDriverInput,
} from './types';

export const DRIVERS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type DriverListResult = Paged<Driver>;

export function filtersToParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    linkStatus: filters.linkStatus ?? null,
    driverType: filters.driverType ?? null,
    month: filters.month ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

export const fetchDrivers = (filters: DriverFilters): Promise<DriverListResult> =>
  fetchPage<Driver>('/drivers', filtersToParams(filters), DRIVERS_DEFAULT_LIMIT);

/** Mời một TÀI KHOẢN KHÁCH đã xác minh SĐT làm tài xế (ADR 0063). */
export const inviteDriver = (body: InviteDriverInput): Promise<Driver> =>
  apiPost<Driver>('/drivers', body);

export const updateDriver = (id: string, body: UpdateDriverInput): Promise<Driver> =>
  apiPatch<Driver>(`/drivers/${id}`, body);

export const suspendDriver = (id: string): Promise<Driver> =>
  apiPost<Driver>(`/drivers/${id}/suspend`);

export const resumeDriver = (id: string): Promise<Driver> =>
  apiPost<Driver>(`/drivers/${id}/resume`);

/** Thu hồi lời mời / kết thúc liên kết — server chặn khi tài xế đang chạy chuyến. */
export const endDriver = (id: string): Promise<unknown> => apiDelete<unknown>(`/drivers/${id}`);

/** Tài xế cho bộ chọn gán đơn — kèm cờ bận khung giờ + trạng thái bằng lái. */
export const fetchAssignableDrivers = (window: {
  pickupAt: string;
  returnAt: string;
  excludeBookingId?: string;
}): Promise<AssignableDriver[]> =>
  apiGet<AssignableDriver[]>('/drivers/assignable', {
    pickupAt: window.pickupAt,
    returnAt: window.returnAt,
    excludeBookingId: window.excludeBookingId ?? null,
  });

/** Tiền công/ngày mặc định của gian hàng + giới hạn hợp lệ (ADR 0075). */
export const fetchDriverWageSettings = (): Promise<DriverWageSettings> =>
  apiGet<DriverWageSettings>('/drivers/wage-settings');

/** Đặt / xoá mức mặc định — chỉ áp cho lượt gán tạo SAU lần lưu này. */
export const updateDriverWageSettings = (
  body: UpdateDriverWageSettingsInput,
): Promise<DriverWageSettings> => apiPatch<DriverWageSettings>('/drivers/wage-settings', body);

export const DRIVER_ASSIGNMENTS_LIMIT = 10;
/** Cỡ trang khi gom cả tháng để xuất bảng kê — đúng trần `limit` của endpoint. */
const DRIVER_ASSIGNMENTS_EXPORT_LIMIT = 100;
/** Trần số trang gom cho một bảng kê — 5.000 chuyến/tháng của MỘT tài xế là dữ liệu hỏng, không phải thật. */
const DRIVER_ASSIGNMENTS_EXPORT_MAX_PAGES = 50;

/** Các chuyến một tài xế đã nhận, kết thúc trong tháng — phân trang server-side. */
export const fetchDriverAssignments = (
  id: string,
  params: { month?: string; page: number; limit?: number },
): Promise<Paged<DriverAssignmentRow>> => {
  const limit = params.limit ?? DRIVER_ASSIGNMENTS_LIMIT;
  return fetchPage<DriverAssignmentRow>(
    `/drivers/${id}/assignments`,
    { month: params.month ?? null, page: params.page, limit },
    limit,
  );
};

/**
 * MỌI chuyến của một tài xế trong tháng — nguồn của bảng kê tiền công. Đi qua cùng client với mọi
 * lời gọi khác (cookie phiên + header phiên hỗ trợ gian hàng), không qua một link tải trần.
 */
export async function fetchAllDriverAssignments(
  id: string,
  month: string | undefined,
): Promise<DriverAssignmentRow[]> {
  const rows: DriverAssignmentRow[] = [];
  for (let page = 1; page <= DRIVER_ASSIGNMENTS_EXPORT_MAX_PAGES; page += 1) {
    const result = await fetchDriverAssignments(id, {
      month,
      page,
      limit: DRIVER_ASSIGNMENTS_EXPORT_LIMIT,
    });
    rows.push(...result.items);
    if (!result.meta.hasNext) break;
  }
  return rows;
}

/** Ngăn chi tiết một tài xế trong tháng `YYYY-MM` (bỏ trống = tháng hiện tại, server quyết). */
export const fetchDriverOverview = (id: string, month: string | undefined): Promise<DriverOverview> =>
  apiGet<DriverOverview>(`/drivers/${id}/overview`, { month: month ?? null });
