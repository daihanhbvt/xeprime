import dayjs, { type Dayjs } from 'dayjs';
import {
  ROUTE_TYPE,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  isRouteType,
  isVehicleServiceTypeAllowed,
  type RouteType,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import type { RentalMode } from '@/components/form/RentalDateTimeRangeField';
import { ROUTES } from '@/constants/routes';
import { applyFilterPatch } from '../filter-params';
import type { MarketplaceFilters } from '../types';

/**
 * Trạng thái của thẻ tìm kiếm trang chủ — **nguồn DUY NHẤT** mà cả hero, thanh thu gọn (sticky)
 * và các panel chỉnh sửa cùng đọc/ghi, cộng với **nơi DUY NHẤT** biến trạng thái đó thành query
 * string (ADR 0004: filter sống ở URL).
 *
 * Thuần hàm, không đụng `next/navigation` — unit-test được và không thể lệch giữa hai bề mặt.
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

/** Các key URL mà thẻ tìm kiếm SỞ HỮU — nó ghi đủ bộ này mỗi lần, không để sót giá trị cũ. */
const OWNED_KEYS = [
  'vehicleType',
  'serviceType',
  'routeType',
  'provinceCode',
  'pickupAt',
  'returnAt',
  'hourly',
] as const satisfies ReadonlyArray<keyof MarketplaceFilters>;

/**
 * Dịch vụ này có hỏi khoảng nhận–trả ở bước TÌM không.
 *
 * Dài hạn: **không** (ADR 0011). Khách lọc ra xe cho thuê dài hạn trước, rồi mới chọn gói
 * 1/2/3/6/9/12 tháng và nêu nguyện vọng ngày nhận trong luồng gửi yêu cầu của TỪNG xe.
 */
export function serviceUsesRentalRange(serviceType: ServiceType): boolean {
  return serviceType !== SERVICE_TYPE.LONG_TERM;
}

/** Khoảng thuê mặc định khi URL chưa mang lịch: mai 10:00 → 3 ngày sau, cùng giờ. */
export function defaultRentalRange(now: Dayjs = dayjs()): { pickupAt: Dayjs; returnAt: Dayjs } {
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
 * lái** — không để lại một tab đang chọn nhưng không tồn tại, và cũng không phát ra URL một tổ
 * hợp không bao giờ có xe.
 */
export function resolveServiceType(vehicleType: VehicleType, desired: ServiceType): ServiceType {
  return isVehicleServiceTypeAllowed(vehicleType, desired) ? desired : SERVICE_TYPE.SELF_DRIVE;
}

/**
 * URL → bản nháp. Giá trị lạ (link bị sửa tay, dịch vụ đã khai tử) rơi về mặc định thay vì
 * làm hỏng form — trang chủ không được trắng vì một query string sai.
 */
export function draftFromFilters(filters: MarketplaceFilters, now: Dayjs = dayjs()): SearchDraft {
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
      pickupAt: filters.pickupAt ? dayjs(filters.pickupAt) : fallback.pickupAt,
      returnAt: filters.returnAt ? dayjs(filters.returnAt) : fallback.returnAt,
      // Tab "Thuê theo giờ" ánh xạ vào filter `hourly` sẵn có (xe CÓ giá thuê giờ) — chế độ sống
      // trong URL bằng đúng hợp đồng hiện tại, không phải một param mới mà backend lơ đi.
      mode: filters.hourly ? 'hourly' : 'daily',
    },
    routeType: isRouteType(filters.routeType) ? filters.routeType : ROUTE_TYPE.IN_CITY,
  };
}

/**
 * Bản nháp → patch URL. Đây là chỗ DUY NHẤT quyết định "dịch vụ nào phát tham số nào", nên
 * hero, sticky, sheet mobile và link "Khám phá xe" không thể nói ba điều khác nhau.
 *
 * `undefined` = XOÁ key khỏi URL (xem `applyFilterPatch`). Nhờ vậy đổi từ tự lái sang dài hạn
 * là `pickupAt`/`returnAt`/`hourly`/`routeType` biến mất thật, không nằm lại như tham số ma.
 *
 * Dài hạn KHÔNG phát: `pickupAt`, `returnAt`, `hourly`, `routeType` — và cũng không có
 * `packageMonths`/`pickupPreference`/`requestedPickupDate`, vì gói và nguyện vọng ngày nhận
 * thuộc luồng gửi yêu cầu của TỪNG xe, không phải bộ lọc marketplace (ADR 0011).
 */
export function draftToFilterPatch(draft: SearchDraft): Partial<MarketplaceFilters> {
  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  return {
    vehicleType: draft.vehicleType,
    serviceType: draft.serviceType,
    provinceCode: draft.provinceCode || undefined,
    routeType: withDriver ? draft.routeType : undefined,
    pickupAt: usesRange ? (draft.rental.pickupAt?.toISOString() ?? undefined) : undefined,
    returnAt: usesRange ? (draft.rental.returnAt?.toISOString() ?? undefined) : undefined,
    hourly: usesRange && draft.rental.mode === 'hourly' ? true : undefined,
  };
}

/**
 * Chữ ký ngữ cảnh tìm kiếm — chỉ các key thẻ tìm kiếm sở hữu, đã chuẩn hoá và sắp xếp.
 *
 * Dùng để so "URL đang nói gì" với "bản nháp đang nói gì" mà không so từng trường: hai bên đi
 * qua đúng một bộ quy tắc serialize nên `''`/`undefined`/`false` không thể tạo ra khác biệt giả.
 */
export function searchContextSignature(source: Partial<MarketplaceFilters>): string {
  const params = new URLSearchParams();
  applyFilterPatch(
    params,
    Object.fromEntries(OWNED_KEYS.map((key) => [key, source[key]])) as Partial<MarketplaceFilters>,
  );
  params.sort();
  return params.toString();
}

/**
 * Link sang trang kết quả mang trọn ngữ cảnh. Dựng từ một `URLSearchParams` RỖNG: thao tác
 * "Tìm xe" là một truy vấn mới, không kế thừa facet đang bật ở nơi khác.
 */
export function buildSearchHref(draft: SearchDraft): string {
  const params = new URLSearchParams();
  applyFilterPatch(params, draftToFilterPatch(draft));
  const qs = params.toString();
  return qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH;
}
