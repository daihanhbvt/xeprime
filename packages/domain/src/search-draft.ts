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
 * Các mốc giờ nhận xe được GỢI Ý, theo giờ Việt Nam.
 *
 * Bốn mốc chứ không phải "giờ tròn kế tiếp": một gợi ý rơi vào 11:00 hay 15:00 trông như một
 * con số máy tính vừa tính ra, còn sáng/trưa/chiều/tối là cách người ta thật sự hẹn nhau đi
 * nhận xe. Ít mốc cũng nghĩa là hai khách mở trang cách nhau mười phút thường thấy CÙNG một gợi
 * ý, nên ảnh chụp màn hình và lời chỉ dẫn qua điện thoại không lệch nhau.
 */
export const DEFAULT_PICKUP_HOURS = [9, 13, 17, 21] as const;

/**
 * Khoảng đệm tối thiểu giữa "bây giờ" và giờ nhận được gợi ý.
 *
 * ⚠️ Đây là tham số SINH MẶC ĐỊNH, **không** phải luật nghiệp vụ: nó không thay validation của
 * form đặt xe và cũng không phải chính sách giờ nhận của từng chủ xe (thứ sống ở `rental-policy`
 * và ở lịch bận của chính chiếc xe). Ý nghĩa duy nhất của nó là: đừng gợi ý một giờ nhận mà
 * chủ xe gần như chắc chắn không kịp chuẩn bị, để khách không phải sửa lại ngay ô vừa được điền.
 */
export const DEFAULT_PICKUP_LEAD_HOURS = 4;

/** Thuê MỘT ngày = đúng 24 giờ, không phải "hôm nay tới mai". */
export const DEFAULT_RENTAL_HOURS = 24;

/**
 * Khoảng thuê GỢI Ý khi chưa có lịch nào hợp lệ: một ngày tròn 24 giờ, bắt đầu ở mốc giờ đẹp
 * gần nhất còn cách hiện tại ít nhất {@link DEFAULT_PICKUP_LEAD_HOURS} giờ.
 *
 * Ví dụ (giờ Việt Nam): 14/09 lúc 10:30 → nhận 14/09 17:00, trả 15/09 17:00. Lúc 18:00 → mốc
 * 21:00 chỉ còn cách 3 giờ nên bị bỏ qua, rơi sang 15/09 09:00 → trả 16/09 09:00.
 *
 * Mọi phép tính đi qua `Dayjs` **đã gắn múi giờ Việt Nam** nên qua nửa đêm, sang tháng và sang
 * năm đều là cộng ngày bình thường, không có nhánh riêng nào để quên. Đó cũng là lý do `now`
 * mặc định là {@link nowInAppTz} chứ không phải `dayjs()` (giờ máy): mốc gợi ý phải giống nhau
 * cho mọi khách, kể cả khách đang ngồi ở múi giờ khác.
 *
 * Trả về 24 giờ chứ không phải 3 ngày như bản trước: phần lớn chuyến trên sàn là thuê ngắn, và
 * một gợi ý dài hơn nhu cầu thật khiến bảng giá hiện ra một con số lớn hơn cái khách sắp trả.
 */
export function defaultRentalRange(now: Dayjs = nowInAppTz()): {
  pickupAt: Dayjs;
  returnAt: Dayjs;
} {
  const earliest = now.add(DEFAULT_PICKUP_LEAD_HOURS, 'hour');
  const day = earliest.startOf('day');

  // `!isBefore` chứ không phải `isAfter`: đúng 05:00 + 4 giờ = 09:00 thì mốc 09:00 vẫn dùng được
  // — nó thoả "cách ít nhất 4 giờ", và loại nó ra sẽ đẩy gợi ý trôi thêm 4 tiếng không lý do.
  const hour = DEFAULT_PICKUP_HOURS.find((value) => !day.hour(value).isBefore(earliest));

  // Hết mốc trong ngày (đã quá 21:00 kể cả sau khi cộng đệm) → mốc đầu tiên của ngày kế tiếp.
  const pickupAt =
    hour === undefined ? day.add(1, 'day').hour(DEFAULT_PICKUP_HOURS[0]) : day.hour(hour);

  return { pickupAt, returnAt: pickupAt.add(DEFAULT_RENTAL_HOURS, 'hour') };
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
