/**
 * "Chiếc xe này đã đủ điều kiện lên chợ chưa" — MỘT định nghĩa cho backend, web và app native.
 *
 * Trước 14/09/2026 luật này tồn tại HAI bản: `missingPublicFields` ở `VehiclesService` trả về
 * các câu tiếng Việt, và `PUBLISH_REQUIREMENTS` ở `apps/web/src/features/vehicles/publication.ts`
 * trả về khoá. Cả hai đều tự ghi trong docblock rằng "sửa một bên phải sửa cả hai" — tức là đã
 * biết trước rằng chúng sẽ lệch. Hệ quả khi lệch không phải là một lỗi hiển thị: checklist ở web
 * nói "đủ rồi", nút sáng, người dùng bấm, và server trả 400 với một câu họ không sửa được.
 *
 * Và có một hệ quả thứ hai, nặng hơn: bản backend trả về **câu chữ tiếng Việt** trong
 * `details.missing`, nên giao diện tiếng Anh không có cách nào hiện đúng danh sách còn thiếu
 * (ADR 0012 — mã là dữ liệu, chỉ NHÃN mới dịch).
 *
 * Vì vậy luật nằm ở đây, dưới dạng MÃ, và hai phía chỉ khác nhau ở chỗ **đếm ảnh**: backend đếm
 * bằng một truy vấn trên `vehicle_images`, web đếm trên mảng `images` đã tải về. Đó là lý do
 * `imageCount` là tham số chứ không đọc từ `vehicle`.
 *
 * Nhãn tương ứng: `Vehicles.publish.requirements.<key>` ở cả hai ngôn ngữ.
 */

import { SERVICE_TYPE, VEHICLE_PUBLIC_MIN_IMAGES } from './status/vehicle';
import { vehicleFieldPolicy } from './status/vehicle-profile';

export const PUBLISH_REQUIREMENT = {
  /** Giá ngày thường — chỉ khi xe đăng dịch vụ tự lái. */
  SELF_DRIVE_PRICE: 'selfDrivePrice',
  /** Giá tháng — chỉ khi xe đăng dịch vụ thuê dài hạn (ADR 0011: giá gói, không nhân 30 ngày). */
  LONG_TERM_PRICE: 'longTermPrice',
  /** Giá/ngày có tài xế — chỉ khi xe đăng dịch vụ có tài xế. */
  WITH_DRIVER_PRICE: 'withDriverPrice',
  MAIN_IMAGE: 'mainImage',
  /** Tối thiểu `VEHICLE_PUBLIC_MIN_IMAGES` URL KHÁC NHAU (ảnh đại diện tính là một). */
  PHOTOS: 'photos',
  PLATE_NUMBER: 'plateNumber',
  /** Hãng · mẫu · năm, cộng chiều phân loại của loại xe (số chỗ với ô tô, phân khúc với xe máy). */
  IDENTITY: 'identity',
  /** Thông số của ĐÚNG nguồn năng lượng đã chọn — theo `vehicleFieldPolicy`. */
  ENERGY_SPEC: 'energySpec',
  /**
   * Xe phải thuộc một chi nhánh CÓ TỈNH.
   *
   * Mục này vốn không nằm trong checklist của web dù backend vẫn chặn bằng một mã lỗi riêng
   * (`BRANCH_LOCATION_REQUIRED`) — nghĩa là chủ xe thấy một checklist xanh hết rồi vẫn bị từ
   * chối. Marketplace lọc theo tỉnh, nên không có tỉnh thì xe được duyệt cũng không ai tìm ra.
   */
  BRANCH_LOCATION: 'branchLocation',
} as const;

export type PublishRequirement = (typeof PUBLISH_REQUIREMENT)[keyof typeof PUBLISH_REQUIREMENT];

export const PUBLISH_REQUIREMENT_VALUES = Object.values(
  PUBLISH_REQUIREMENT,
) as PublishRequirement[];

export function isPublishRequirement(value: unknown): value is PublishRequirement {
  return typeof value === 'string' && (PUBLISH_REQUIREMENT_VALUES as string[]).includes(value);
}

/**
 * Lát cắt của một chiếc xe mà luật này cần — cố ý khai bằng `unknown` cho các ô TIỀN.
 *
 * Backend cầm `Decimal`, web cầm `string`, app native cầm `string`. Ba kiểu khác nhau cho cùng
 * một ô (ADR 0007: Decimal ở BE, string trong JSON), và ép chúng về một kiểu ở đây sẽ buộc một
 * trong ba phía phải nhào nặn dữ liệu trước khi hỏi — đúng loại bước trung gian mà một bản sao
 * thứ hai của luật hay mọc lên từ đó.
 */
export interface VehiclePublicationInput {
  vehicleType: string;
  serviceTypes?: readonly string[] | null;
  weekdayPrice?: unknown;
  monthlyPrice?: unknown;
  withDriverDailyPrice?: unknown;
  mainImageUrl?: string | null;
  plateNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  seatCount?: number | null;
  motorbikeCategory?: string | null;
  /**
   * `unknown` cùng lý do với các ô tiền: cột này là `Decimal` ở DB, nên backend cầm `Decimal` còn
   * web/native cầm `string` (ADR 0007). Ép nó về `number` buộc một phía phải `parseFloat` trước
   * khi hỏi — và một bước nhào nặn như vậy là chỗ bản sao thứ hai của luật hay mọc lên.
   */
  fuelConsumptionCombined?: unknown;
  engineDisplacementCc?: number | null;
  electricRangeKm?: number | null;
  /** Chi nhánh của xe đã có mã tỉnh chưa — nơi gọi tự phân giải từ quan hệ của mình. */
  branchProvinceCode?: string | null;
}

/** `null`/`undefined`/chuỗi rỗng là "chưa có"; `Decimal(0)` và `'0'` là ĐÃ CÓ (giá 0 là một giá). */
function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function filled(value?: string | null): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function serves(vehicle: VehiclePublicationInput, serviceType: string): boolean {
  return (vehicle.serviceTypes ?? []).includes(serviceType);
}

function identityReady(vehicle: VehiclePublicationInput): boolean {
  if (!filled(vehicle.brand) || !filled(vehicle.model) || vehicle.manufactureYear == null) {
    return false;
  }
  const policy = vehicleFieldPolicy(vehicle.vehicleType, vehicle.fuelType);
  if (policy.seatCount === 'required' && vehicle.seatCount == null) return false;
  if (policy.motorbikeCategory === 'required' && !filled(vehicle.motorbikeCategory)) return false;
  return true;
}

function energySpecReady(vehicle: VehiclePublicationInput): boolean {
  if (!filled(vehicle.fuelType)) return false;
  const policy = vehicleFieldPolicy(vehicle.vehicleType, vehicle.fuelType);
  if (policy.fuelConsumption === 'required' && !hasValue(vehicle.fuelConsumptionCombined)) {
    return false;
  }
  if (policy.engineDisplacementCc === 'required' && vehicle.engineDisplacementCc == null) {
    return false;
  }
  if (policy.electricRangeKm === 'required' && vehicle.electricRangeKm == null) return false;
  if (policy.transmission === 'required' && !filled(vehicle.transmission)) return false;
  return true;
}

/**
 * Bảng luật: mỗi điều kiện biết nó CÓ ÁP DỤNG với chiếc xe này không, và đã ĐẠT chưa.
 *
 * `applies` tồn tại vì giá kiểm THEO DỊCH VỤ xe đăng (17/08/2026): xe chỉ chạy có tài xế không
 * bị đòi giá tự lái, và ngược lại. Điều kiện không áp dụng thì không hiện trong checklist —
 * hiện nó ra là bảo người dùng đi điền một ô mà form của họ còn không có.
 *
 * Chỉ mang LOGIC và KHOÁ, không mang chữ: đây là hằng module scope, mà một hằng module scope
 * được tính đúng một lần cho cả tiến trình — nhãn nằm trong đó sẽ đóng băng ở ngôn ngữ của
 * request đầu tiên (ADR 0012).
 */
export const PUBLISH_REQUIREMENTS: readonly {
  key: PublishRequirement;
  applies: (vehicle: VehiclePublicationInput) => boolean;
  present: (vehicle: VehiclePublicationInput, imageCount: number) => boolean;
}[] = [
  {
    key: PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE,
    applies: (v) => serves(v, SERVICE_TYPE.SELF_DRIVE),
    present: (v) => hasValue(v.weekdayPrice),
  },
  {
    key: PUBLISH_REQUIREMENT.LONG_TERM_PRICE,
    applies: (v) => serves(v, SERVICE_TYPE.LONG_TERM),
    present: (v) => hasValue(v.monthlyPrice),
  },
  {
    key: PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE,
    applies: (v) => serves(v, SERVICE_TYPE.WITH_DRIVER),
    present: (v) => hasValue(v.withDriverDailyPrice),
  },
  {
    key: PUBLISH_REQUIREMENT.MAIN_IMAGE,
    applies: () => true,
    present: (v) => filled(v.mainImageUrl),
  },
  {
    key: PUBLISH_REQUIREMENT.PHOTOS,
    applies: () => true,
    present: (_v, imageCount) => imageCount >= VEHICLE_PUBLIC_MIN_IMAGES,
  },
  {
    key: PUBLISH_REQUIREMENT.PLATE_NUMBER,
    applies: () => true,
    present: (v) => filled(v.plateNumber),
  },
  { key: PUBLISH_REQUIREMENT.IDENTITY, applies: () => true, present: (v) => identityReady(v) },
  { key: PUBLISH_REQUIREMENT.ENERGY_SPEC, applies: () => true, present: (v) => energySpecReady(v) },
  {
    key: PUBLISH_REQUIREMENT.BRANCH_LOCATION,
    applies: () => true,
    present: (v) => filled(v.branchProvinceCode),
  },
  // Mô tả KHÔNG bắt buộc (09/09/2026): ảnh + thông số + giá đã đủ để khách quyết định, và một ô
  // mô tả bắt buộc chỉ đẻ ra những dòng "xe đẹp, máy êm" viết cho có.
];

/** Các điều kiện CÓ HIỆU LỰC với xe này — checklist chỉ hiện những mục này. */
export function applicablePublishRequirements(vehicle: VehiclePublicationInput) {
  return PUBLISH_REQUIREMENTS.filter((item) => item.applies(vehicle));
}

/**
 * Khoá các điều kiện còn THIẾU. Rỗng ⇒ gửi duyệt được.
 *
 * Đây là cổng THẬT ở backend (`VehiclesService.submitForPublicReview`) và là checklist ở web —
 * cùng một hàm, nên không còn khả năng một bên nói đủ còn bên kia nói thiếu.
 */
export function missingPublishRequirements(
  vehicle: VehiclePublicationInput,
  imageCount: number,
): PublishRequirement[] {
  return applicablePublishRequirements(vehicle)
    .filter((item) => !item.present(vehicle, imageCount))
    .map((item) => item.key);
}
