import type { components } from '@xeprime/types';
import { DRIVER_LIST_SORT } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Một LIÊN KẾT tài xế của bên thuê với một tài khoản khách (ADR 0063). */
export type Driver = Schemas['DriverDto'];
export type InviteDriverInput = Schemas['InviteDriverDto'];
export type UpdateDriverInput = Schemas['UpdateDriverDto'];
export type DriverLicenceSummary = Schemas['DriverLicenceSummaryDto'];
/** Tài xế trong bộ chọn gán đơn — `busy` = có chuyến khác giao khung giờ, ở BẤT KỲ bên thuê nào. */
export type AssignableDriver = Schemas['AssignableDriverDto'];
/** Tiền công/ngày mặc định của bên thuê + giới hạn nền tảng (ADR 0075). */
export type DriverWageSettings = Schemas['DriverWageSettingsDto'];
export type UpdateDriverWageSettingsInput = Schemas['UpdateDriverWageSettingsDto'];
/** Một chuyến tài xế đã nhận, kết thúc trong tháng — tiền công theo tài xế. */
export type DriverAssignmentRow = Schemas['DriverAssignmentRowDto'];

/** Ngăn chi tiết một tài xế: hồ sơ + tiền công tháng + việc đang treo + độ tin cậy + xu hướng. */
export type DriverOverview = Schemas['DriverOverviewDto'];
/** Dải số đếm đầu màn Tài xế — đã áp bộ lọc chung. */
export type DriverSummary = Schemas['DriverSummaryDto'];
/** Một dòng của danh sách GỘP (liên kết + nội bộ) — `kind` quyết thẻ nào dựng (25/11/2026). */
export type DriverRosterItem = Schemas['DriverRosterItemDto'];
/** Dải số đếm của danh sách gộp. */
export type DriverRosterSummary = Schemas['DriverRosterSummaryDto'];
/** Tra tài khoản khách đã xác minh theo SĐT trước khi mời. */
export type DriverAccountLookup = Schemas['DriverAccountLookupDto'];
/** Chuyến đang gán của một tài xế (liên kết hoặc nội bộ). */
export type DriverCurrentTrip = Schemas['DriverCurrentTripDto'];
/** Danh bạ tài xế NỘI BỘ (ADR 0108). */
export type InternalDriver = Schemas['InternalDriverDto'];
export type CreateInternalDriverInput = Schemas['CreateInternalDriverDto'];
export type UpdateInternalDriverInput = Schemas['UpdateInternalDriverDto'];
export type AssignableInternalDriver = Schemas['AssignableInternalDriverDto'];
export type InternalDriverOverview = Schemas['InternalDriverOverviewDto'];
export type InternalDriverTripRow = Schemas['InternalDriverTripRowDto'];

/**
 * Bảng chuyến của trang chi tiết tài xế — gương web `DriverTripFilters`. `status`: liên kết = kết
 * cục lượt gán (`DRIVER_ASSIGNMENT_OUTCOME`), nội bộ = trạng thái đơn.
 */
export interface DriverTripFilters {
  month?: string | undefined;
  q?: string | undefined;
  status?: string | undefined;
  page?: number;
  limit?: number;
}

export function tripFiltersToParams(filters: DriverTripFilters): QueryParams {
  return {
    month: filters.month ?? null,
    q: filters.q?.trim() || null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVER_ASSIGNMENTS_LIMIT,
  };
}

/** Cùng con số với web (`DRIVER_ASSIGNMENTS_LIMIT`). */
export const DRIVER_ASSIGNMENTS_LIMIT = 10;

/** Cùng `DEFAULT_PAGE_SIZE` mà web dùng cho bảng tài xế. */
export const DRIVERS_DEFAULT_LIMIT = 20;

export interface AssignableWindow {
  pickupAt: string;
  returnAt: string;
  /** Đơn ĐANG sửa — trừ chính nó ra, nếu không tài xế đã gán tự báo là đang bận. */
  excludeBookingId?: string;
}

export interface DriverFilters {
  q?: string;
  /**
   * Bỏ trống = các liên kết còn mở (mời · đang liên kết · tạm khoá) — mặc định của server;
   * `any` = mọi trạng thái; `closed` = đã từ chối + đã kết thúc.
   */
  linkStatus?: string;
  driverType?: string;
  /** `needed` = chỉ liên kết cần đối chiếu bằng lái (`DRIVER_LICENCE_CHECK_FILTER`). */
  licenceCheck?: string;
  /** `DRIVER_OPERATION_FILTER` — đang có chuyến / rảnh. */
  operation?: string;
  /** `DRIVER_LIST_SORT` — bỏ trống = mới nhất (mặc định của màn, khác mặc định server). */
  sort?: string;
  /** Tháng `YYYY-MM` (giờ VN) của hai cột thống kê tiền công — bỏ trống = tháng hiện tại. */
  month?: string;
  page?: number;
  limit?: number;
}

/** Bộ lọc chung của danh sách VÀ dải số đếm — trạng thái liên kết đi riêng. Như web. */
export function driverSharedFilterParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    driverType: filters.driverType ?? null,
    operation: filters.operation ?? null,
  };
}

export function driverFiltersToParams(filters: DriverFilters): QueryParams {
  return {
    ...driverSharedFilterParams(filters),
    linkStatus: filters.linkStatus ?? null,
    licenceCheck: filters.licenceCheck ?? null,
    sort: filters.sort ?? DRIVER_LIST_SORT.NEWEST,
    month: filters.month ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

const base = '/drivers';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

/**
 * Tài xế của bên thuê (gian hàng HOẶC chủ xe tuyến hoa hồng — ADR 0063) và bộ chọn gán đơn.
 * Bản native của `apps/web/src/features/drivers/api.ts` (ADR 0031 — sửa hợp đồng là sửa CẢ HAI).
 *
 * Khả dụng do SERVER quyết định — client không tự tính lịch bận, và backend vẫn kiểm lại trong
 * transaction lúc gán.
 */
export const driversApi = {
  /**
   * Danh sách GỘP tài xế liên kết + tài xế nội bộ (web `fetchDriverRoster`, 25/11/2026) — lọc, sắp,
   * phân trang ở server. `list` (chỉ liên kết) còn lại cho chỗ khác dùng.
   */
  roster(filters: DriverFilters): Promise<Paged<DriverRosterItem>> {
    return getApiClient().fetchPage<DriverRosterItem>(
      `${base}/roster`,
      driverFiltersToParams(filters),
      DRIVERS_DEFAULT_LIMIT,
    );
  },

  /** Dải số đếm đầu màn — mỗi ô bằng tổng danh sách khi bấm vào nó. */
  rosterSummary(filters: DriverFilters): Promise<DriverRosterSummary> {
    return getApiClient().get<DriverRosterSummary>(
      `${base}/roster/summary`,
      driverSharedFilterParams(filters),
    );
  },

  /** Tra tài khoản khách đã xác minh theo SĐT — hộp mời hiện tên + ảnh trước khi gửi. */
  accountLookup(phone: string): Promise<DriverAccountLookup> {
    return getApiClient().get<DriverAccountLookup>(`${base}/account-lookup`, { phone });
  },

  /**
   * "Đã đối chiếu" bằng lái hiện tại của tài xế (tên trên bằng lệch tên đã đặt) — tài xế nộp bằng
   * mới thì nhãn "Cần đối chiếu" tự hiện lại. `checked = false` gỡ đánh dấu.
   */
  setLicenceChecked(id: string, checked: boolean): Promise<Driver> {
    return checked
      ? getApiClient().post<Driver>(`${one(id)}/licence-check`)
      : getApiClient().delete<Driver>(`${one(id)}/licence-check`);
  },

  /** Dải số đếm đầu màn — mỗi ô bằng tổng danh sách khi bấm vào nó. */
  summary(filters: DriverFilters): Promise<DriverSummary> {
    return getApiClient().get<DriverSummary>(`${base}/summary`, driverSharedFilterParams(filters));
  },
  list(filters: DriverFilters): Promise<Paged<Driver>> {
    return getApiClient().fetchPage<Driver>(
      base,
      driverFiltersToParams(filters),
      DRIVERS_DEFAULT_LIMIT,
    );
  },

  /** Mời một TÀI KHOẢN KHÁCH đã xác minh SĐT (`DRIVER_ACCOUNT_NOT_FOUND` khi chưa có). */
  invite(body: InviteDriverInput): Promise<Driver> {
    return getApiClient().post<Driver>(base, body);
  },

  update(id: string, body: UpdateDriverInput): Promise<Driver> {
    return getApiClient().patch<Driver>(one(id), body);
  },

  suspend(id: string): Promise<Driver> {
    return getApiClient().post<Driver>(`${one(id)}/suspend`);
  },

  resume(id: string): Promise<Driver> {
    return getApiClient().post<Driver>(`${one(id)}/resume`);
  },

  /** Thu hồi lời mời / kết thúc liên kết — server chặn khi tài xế đang chạy chuyến. */
  end(id: string): Promise<unknown> {
    return getApiClient().delete<unknown>(one(id));
  },

  assignable(window: AssignableWindow): Promise<AssignableDriver[]> {
    return getApiClient().get<AssignableDriver[]>(`${base}/assignable`, {
      pickupAt: window.pickupAt,
      returnAt: window.returnAt,
      excludeBookingId: window.excludeBookingId ?? null,
    });
  },

  /** Tiền công/ngày mặc định + giới hạn hợp lệ (ADR 0075). */
  wageSettings(): Promise<DriverWageSettings> {
    return getApiClient().get<DriverWageSettings>(`${base}/wage-settings`);
  },

  /** Đặt / xoá mức mặc định — chỉ áp cho lượt gán tạo SAU lần lưu này. */
  updateWageSettings(body: UpdateDriverWageSettingsInput): Promise<DriverWageSettings> {
    return getApiClient().patch<DriverWageSettings>(`${base}/wage-settings`, body);
  },

  /** Các chuyến một tài xế đã nhận, kết thúc trong tháng — phân trang server-side. */
  /** Các chuyến một tài xế LIÊN KẾT đã nhận, kết thúc trong tháng — tìm + lọc kết cục ở server. */
  assignments(id: string, filters: DriverTripFilters): Promise<Paged<DriverAssignmentRow>> {
    const params = tripFiltersToParams(filters);
    return getApiClient().fetchPage<DriverAssignmentRow>(
      `${one(id)}/assignments`,
      { ...params, outcome: filters.status ?? null },
      Number(params.limit),
    );
  },

  /** Chi tiết một tài xế trong tháng `YYYY-MM` (bỏ trống = tháng hiện tại, server quyết). */
  overview(id: string, month: string | undefined): Promise<DriverOverview> {
    return getApiClient().get<DriverOverview>(`${one(id)}/overview`, { month: month ?? null });
  },
};

const internalBase = '/internal-drivers';
const internalOne = (id: string) => `${internalBase}/${encodeURIComponent(id)}`;

/**
 * Danh bạ tài xế NỘI BỘ (ADR 0108) — native port of web `features/drivers/api.ts`. Xem
 * `drivers.view`, thêm/sửa/lưu trữ `drivers.manage`. Danh sách nằm trong `driversApi.roster`.
 */
export const internalDriversApi = {
  /** Trang chi tiết một tài xế nội bộ: hồ sơ + đơn đang gán. */
  detail(id: string): Promise<InternalDriverOverview> {
    return getApiClient().get<InternalDriverOverview>(internalOne(id));
  },

  /** Các đơn đã gán, trả xe trong tháng — tìm + lọc trạng thái đơn ở server. */
  trips(id: string, filters: DriverTripFilters): Promise<Paged<InternalDriverTripRow>> {
    const params = tripFiltersToParams(filters);
    return getApiClient().fetchPage<InternalDriverTripRow>(
      `${internalOne(id)}/trips`,
      { ...params, status: filters.status ?? null },
      Number(params.limit),
    );
  },

  /** Bộ chọn gán đơn — người đang dùng, kèm cờ bận theo khung giờ (bỏ qua chính đơn đó). */
  assignable(window: AssignableWindow): Promise<AssignableInternalDriver[]> {
    return getApiClient().get<AssignableInternalDriver[]>(`${internalBase}/assignable`, {
      pickupAt: window.pickupAt,
      returnAt: window.returnAt,
      excludeBookingId: window.excludeBookingId ?? null,
    });
  },

  create(body: CreateInternalDriverInput): Promise<InternalDriver> {
    return getApiClient().post<InternalDriver>(internalBase, body);
  },

  update(id: string, body: UpdateInternalDriverInput): Promise<InternalDriver> {
    return getApiClient().patch<InternalDriver>(internalOne(id), body);
  },

  archive(id: string): Promise<InternalDriver> {
    return getApiClient().post<InternalDriver>(`${internalOne(id)}/archive`);
  },

  restore(id: string): Promise<InternalDriver> {
    return getApiClient().post<InternalDriver>(`${internalOne(id)}/restore`);
  },
};
