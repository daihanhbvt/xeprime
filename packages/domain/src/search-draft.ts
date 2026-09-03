import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from './datetime';
import {
  ROUTE_TYPE,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  isRouteType,
  isVehicleServiceTypeAllowed,
  type MarketplaceFilters,
  type RouteType,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';

/**
 * Trạng thái của thẻ tìm kiếm trang chủ, và luật biến nó thành tham số lọc.
 *
 * Thuần hàm — không đụng `next/navigation`, không đụng React. Web đọc/ghi bản nháp này qua URL
 * searchParams (ADR 0004), app native giữ nó ở state màn hình; **luật thì chung**, nên hai
 * client không thể nói hai điều khác nhau về cùng một thao tác tìm xe.
 *
 * ## Phân tầng
 *
 *   1. Loại xe (ô tô / xe máy) — độc lập với dịch vụ.
 *   2. Dịch vụ (tự lái / có tài xế / dài hạn) — quyết định form bên dưới.
 *   3. Tiêu chí của riêng dịch vụ đó.
 *
 * ## Vì sao `rental` dùng CHUNG cho tự lái và có tài xế
 *
 * Hai dịch vụ này hỏi cùng một thứ: một khoảng nhận–trả. Tách thành hai bản nháp rời chỉ tạo
 * ra một cách mất dữ liệu mới (đổi tab là mất lịch vừa chọn) mà không mua lại điều gì — chúng
 * không bao giờ được phát ra cùng lúc. **Dài hạn** thì khác hẳn về CHẤT: nó không có khoảng
 * ngày nào cả (ADR 0011 — khách chọn GÓI và nêu nguyện vọng ngày nhận SAU khi đã chọn xe), nên
 * nó không có ô lịch riêng chứ không phải "có ô lịch nhưng để trống".
 */
export type RentalMode = 'daily' | 'hourly';

export interface SearchDraft {
  vehicleType: VehicleType;
  serviceType: ServiceType;
  /** MÃ tỉnh — cùng giá trị đi vào URL và gửi API. Chuỗi rỗng = Toàn quốc. */
  provinceCode: string;
  /** Khoảng thuê. Chỉ có nghĩa với dịch vụ CÓ hỏi lịch — xem {@link serviceUsesRentalRange}. */
  rental: { pickupAt: Dayjs | null; returnAt: Dayjs | null; mode: RentalMode };
  /** Lộ trình — chỉ có nghĩa với CÓ TÀI XẾ; là ngữ cảnh báo giá, không phải chiều lọc. */
  routeType: RouteType;
}

/** Các key mà thẻ tìm kiếm SỞ HỮU — nó ghi đủ bộ này mỗi lần, không để sót giá trị cũ. */
export const SEARCH_OWNED_KEYS = [
  'vehicleType',
  'serviceType',
  'routeType',
  'provinceCode',
  'pickupAt',
  'returnAt',
  'hourly',
] as const satisfies ReadonlyArray<keyof MarketplaceFilters>;

/**
 * Thứ tự trưng bày ba dịch vụ. Cố định để đổi loại xe không làm các tab còn lại nhảy chỗ.
 */
const SERVICE_TYPE_ORDER = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
  SERVICE_TYPE.LONG_TERM,
] as const satisfies ReadonlyArray<ServiceType>;

/**
 * Dịch vụ khả dụng cho MỘT loại xe, theo đúng thứ tự trưng bày.
 *
 * Xe máy không có "có tài xế" — tab đó biến mất hẳn thay vì hiện rồi báo lỗi. Luật thuộc về
 * `isVehicleServiceTypeAllowed`; hàm này chỉ thêm THỨ TỰ, và tồn tại để mọi bề mặt (thẻ tìm
 * kiếm, thanh thu gọn, chip ở màn kết quả) đọc chung một danh sách thay vì mỗi nơi tự chép
 * một mảng ba phần tử rồi lệch nhau khi thêm dịch vụ thứ tư.
 */
export function serviceTypesFor(vehicleType: VehicleType): readonly ServiceType[] {
  return SERVICE_TYPE_ORDER.filter((value) => isVehicleServiceTypeAllowed(vehicleType, value));
}

/**
 * Dịch vụ này có hỏi khoảng nhận–trả ở bước TÌM không.
 *
 * Dài hạn: **không** (ADR 0011). Khách lọc ra xe cho thuê dài hạn trước, rồi mới chọn gói
 * 1/2/3/6/9/12 tháng và nêu nguyện vọng ngày nhận trong luồng gửi yêu cầu của TỪNG xe.
 */
export function serviceUsesRentalRange(serviceType: ServiceType): boolean {
  return serviceType !== SERVICE_TYPE.LONG_TERM;
}

/**
 * Khoảng thuê mặc định khi chưa có lịch: mai 10:00 → 3 ngày sau, cùng giờ.
 *
 * "Mai 10:00" là 10:00 **giờ Việt Nam** — mốc mặc định phải giống nhau cho mọi khách, kể cả
 * khách đang ngồi ở múi giờ khác. Đó là lý do `now` mặc định là {@link nowInAppTz}, không phải
 * `dayjs()` (giờ máy).
 */
export function defaultRentalRange(now: Dayjs = nowInAppTz()): {
  pickupAt: Dayjs;
  returnAt: Dayjs;
} {
  return {
    pickupAt: now.add(1, 'day').hour(10).startOf('hour'),
    returnAt: now.add(4, 'day').hour(10).startOf('hour'),
  };
}

function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === 'string' && (VEHICLE_TYPE_VALUES as string[]).includes(value);
}

function isServiceType(value: unknown): value is ServiceType {
  return typeof value === 'string' && (SERVICE_TYPE_VALUES as string[]).includes(value);
}

/**
 * Dịch vụ hợp lệ cho loại xe đang chọn.
 *
 * Xe máy không có "có tài xế" ({@link isVehicleServiceTypeAllowed}). Đổi Ô tô → Xe máy khi đang
 * ở tab đó, hoặc mở một link `vehicleType=motorbike&serviceType=with_driver`, đều rơi về **tự
 * lái** — không để lại một tab đang chọn nhưng không tồn tại, và cũng không phát ra một tổ hợp
 * không bao giờ có xe.
 */
export function resolveServiceType(vehicleType: VehicleType, desired: ServiceType): ServiceType {
  return isVehicleServiceTypeAllowed(vehicleType, desired) ? desired : SERVICE_TYPE.SELF_DRIVE;
}

/**
 * Filter → bản nháp. Giá trị lạ (link bị sửa tay, dịch vụ đã khai tử) rơi về mặc định thay vì
 * làm hỏng form — trang chủ không được trắng vì một tham số sai.
 */
export function draftFromFilters(
  filters: MarketplaceFilters,
  now: Dayjs = nowInAppTz(),
): SearchDraft {
  const fallback = defaultRentalRange(now);
  const vehicleType = isVehicleType(filters.vehicleType) ? filters.vehicleType : VEHICLE_TYPE.CAR;
  return {
    vehicleType,
    serviceType: resolveServiceType(
      vehicleType,
      isServiceType(filters.serviceType) ? filters.serviceType : SERVICE_TYPE.SELF_DRIVE,
    ),
    provinceCode: filters.provinceCode ?? '',
    rental: {
      pickupAt: filters.pickupAt ? toAppTz(filters.pickupAt) : fallback.pickupAt,
      returnAt: filters.returnAt ? toAppTz(filters.returnAt) : fallback.returnAt,
      // Tab "Thuê theo giờ" ánh xạ vào filter `hourly` sẵn có (xe CÓ giá thuê giờ) — chế độ sống
      // bằng đúng hợp đồng hiện tại, không phải một param mới mà backend lơ đi.
      mode: filters.hourly ? 'hourly' : 'daily',
    },
    routeType: isRouteType(filters.routeType) ? filters.routeType : ROUTE_TYPE.IN_CITY,
  };
}

/**
 * Bản nháp → patch filter. Đây là chỗ DUY NHẤT quyết định "dịch vụ nào phát tham số nào", nên
 * hero, sticky, sheet mobile và link "Khám phá xe" không thể nói ba điều khác nhau.
 *
 * `undefined` = XOÁ key. Nhờ vậy đổi từ tự lái sang dài hạn là `pickupAt`/`returnAt`/`hourly`/
 * `routeType` biến mất thật, không nằm lại như tham số ma.
 *
 * Dài hạn KHÔNG phát: `pickupAt`, `returnAt`, `hourly`, `routeType` — và cũng không có
 * `packageMonths`/`pickupPreference`/`requestedPickupDate`, vì gói và nguyện vọng ngày nhận
 * thuộc luồng gửi yêu cầu của TỪNG xe, không phải bộ lọc marketplace (ADR 0011).
 */
export type SearchFilterPatch = {
  [K in keyof MarketplaceFilters]?: MarketplaceFilters[K] | undefined;
};

export function draftToFilterPatch(draft: SearchDraft): SearchFilterPatch {
  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  return {
    vehicleType: draft.vehicleType,
    serviceType: draft.serviceType,
    provinceCode: draft.provinceCode || undefined,
    routeType: withDriver ? draft.routeType : undefined,
    // Giờ trên ô chọn là giờ VIỆT NAM (CLAUDE.md §9) — `.toISOString()` trần sẽ đọc nó theo
    // giờ máy và đẩy một link chia sẻ lệch đúng phần chênh múi giờ của người gửi.
    pickupAt: usesRange
      ? draft.rental.pickupAt
        ? appWallClockToIso(draft.rental.pickupAt)
        : undefined
      : undefined,
    returnAt: usesRange
      ? draft.rental.returnAt
        ? appWallClockToIso(draft.rental.returnAt)
        : undefined
      : undefined,
    hourly: usesRange && draft.rental.mode === 'hourly' ? true : undefined,
  };
}
