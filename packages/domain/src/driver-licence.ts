import {
  API_ERROR_CODE,
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_STATUS,
  VEHICLE_TYPE,
  addCalendarMonthsVn,
  vnDateKey,
  type DriverLicenceKind,
  type DriverLicenceStatus,
} from '@xeprime/types';

/**
 * Bằng lái lái được LOẠI XE nào, và có dùng được cho MỘT chuyến không — ADR 0057.
 *
 * Luật thuần, dùng chung cho API (cổng gửi yêu cầu + quyết định tự động) và client (báo trước cho
 * khách trước khi họ bấm gửi). Hai bên phải nói cùng một câu về cùng một chiếc bằng.
 */

/**
 * Ngày hệ thống hạng GPLX mới có hiệu lực (Luật Trật tự, an toàn giao thông đường bộ 2024).
 *
 * Cần mốc này vì có một hạng ĐỔI NGHĨA: `B1` mẫu cũ là ô tô dưới 9 chỗ (không hành nghề), còn
 * `B1` mẫu mới là mô tô BA bánh. Các hạng khác không trùng tên giữa hai hệ (`A2`/`B2` chỉ có ở mẫu
 * cũ, `A`/`B`/`C1`… chỉ có ở mẫu mới), nên ngày cấp chỉ quyết định đúng một chỗ đó.
 */
export const VN_LICENCE_CLASS_REFORM_DATE = '2025-01-01';

/** Hạng GPLX Việt Nam mẫu cũ (cấp trước 01/01/2025). A3, A4 không lái được xe thuê nên vắng mặt. */
const VN_LEGACY_MOTORBIKE = new Set(['A1', 'A2']);
const VN_LEGACY_CAR = new Set(['B1', 'B2', 'C', 'D', 'E', 'FB2', 'FC', 'FD', 'FE']);

/** Hạng GPLX Việt Nam mẫu mới (từ 01/01/2025). B1 mới = mô tô ba bánh ⇒ không phải xe thuê. */
const VN_2025_MOTORBIKE = new Set(['A1', 'A']);
const VN_2025_CAR = new Set([
  'B',
  'C1',
  'C',
  'D1',
  'D2',
  'D',
  'BE',
  'C1E',
  'CE',
  'D1E',
  'D2E',
  'DE',
]);

/** Giấy phép lái xe quốc tế theo Công ước Viên 1968 (mẫu Việt Nam công nhận). B1 = xe ba/bốn bánh nhẹ. */
const IDP_MOTORBIKE = new Set(['A', 'A1']);
const IDP_CAR = new Set(['B', 'BE', 'C', 'C1', 'C1E', 'CE', 'D', 'D1', 'D1E', 'DE']);

/**
 * Chuẩn hoá một hạng đọc từ ảnh: cắt phần chú thích ở khoảng trắng / ngoặc đầu tiên
 * ("B1 (số tự động)", "B1 số tự động", "B2 AT" → "B1", "B1", "B2"), bỏ dấu chấm ("F.B2" → "FB2"),
 * viết hoa, rồi đòi KHỚP TRỌN một mã hạng. Không khớp ⇒ `null` — "Class B" không được thành
 * "CLAS", vì một hạng rác là một bằng hợp lệ bị máy từ chối oan.
 */
export function normalizeLicenceClass(raw: string): string | null {
  const head = raw.trim().split(/[\s(]/, 1)[0] ?? '';
  const compact = head.replace(/\./g, '').toUpperCase();
  return /^[A-F][A-Z0-9]{0,3}$/.test(compact) ? compact : null;
}

/** Danh sách hạng đã chuẩn hoá, bỏ trùng, giữ thứ tự xuất hiện. */
export function normalizeLicenceClasses(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    const value = normalizeLicenceClass(item);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

export interface LicenceCoverage {
  car: boolean;
  motorbike: boolean;
}

/**
 * Bằng này lái được ô tô / xe máy không — suy TẤT ĐỊNH từ hạng in trên bằng.
 *
 * `null` với bằng nước ngoài: hạng của mỗi quốc gia là một hệ riêng ("Class C" ở Mỹ là ô tô con),
 * nên không có bảng tra nào đúng cho mọi nước. Máy tự xác thực bằng nước ngoài với cả hai cờ bật
 * (chủ xe đối chiếu lúc giao xe); người duyệt chốt hai cờ khi duyệt tay (ADR 0057 điều 2c, 3).
 */
export function licenceClassCoverage(input: {
  kind: DriverLicenceKind;
  classes: readonly string[];
  /** YYYY-MM-DD; chỉ dùng cho GPLX Việt Nam. Không đọc được ⇒ coi là mẫu cũ (đa số bằng đang lưu hành). */
  issuedOn: string | null;
}): LicenceCoverage | null {
  const classes = normalizeLicenceClasses(input.classes);
  let motorbikeSet: ReadonlySet<string>;
  let carSet: ReadonlySet<string>;

  switch (input.kind) {
    case DRIVER_LICENCE_KIND.VN: {
      const reformed = input.issuedOn !== null && input.issuedOn >= VN_LICENCE_CLASS_REFORM_DATE;
      motorbikeSet = reformed ? VN_2025_MOTORBIKE : VN_LEGACY_MOTORBIKE;
      carSet = reformed ? VN_2025_CAR : VN_LEGACY_CAR;
      break;
    }
    case DRIVER_LICENCE_KIND.INTERNATIONAL_PERMIT:
      motorbikeSet = IDP_MOTORBIKE;
      carSet = IDP_CAR;
      break;
    default:
      return null;
  }

  return {
    car: classes.some((c) => carSet.has(c)),
    motorbike: classes.some((c) => motorbikeSet.has(c)),
  };
}

/** Bằng có phủ loại xe này không. Loại xe lạ (dữ liệu cũ) ⇒ đòi bằng ô tô — phía an toàn. */
export function licenceCoversVehicleType(
  coverage: LicenceCoverage,
  vehicleType: string | null | undefined,
): boolean {
  return vehicleType === VEHICLE_TYPE.MOTORBIKE ? coverage.motorbike : coverage.car;
}

/**
 * Còn hiệu lực tới hết ngày `dateKey` (YYYY-MM-DD, giờ Việt Nam) không.
 *
 * Bằng quốc tế / nước ngoài đã xác thực mà KHÔNG có hạn là "hạn chưa đọc được" chứ không phải "hết
 * hạn": máy không đọc tin cậy được ngày trên bố cục nước ngoài, và chủ xe đối chiếu bằng gốc khi giao
 * xe (ADR 0057, sửa 09/10/2026). Không khai `kind` thì coi như GPLX Việt Nam — phía chặt.
 */
export function licenceValidThrough(
  licence: { expiresOn: string | null; noExpiry: boolean; kind?: string | null },
  dateKey: string,
): boolean {
  if (licence.noExpiry) return true;
  if (!licence.expiresOn) {
    return (
      licence.kind !== undefined && licence.kind !== null && licence.kind !== DRIVER_LICENCE_KIND.VN
    );
  }
  return licence.expiresOn >= dateKey;
}

/**
 * Ngày cuối của chuyến theo giờ Việt Nam — bằng phải còn hạn tới HẾT ngày đó.
 *
 *  - Thuê theo ngày: ngày của thời điểm trả, trừ 1ms (trả lúc 00:00 là hết ngày HÔM TRƯỚC — cùng
 *    quy ước với lịch bận).
 *  - Dài hạn chưa có ngày nhận chắc chắn: ngày nhận MUỘN NHẤT khách đã nêu cộng số tháng lịch của
 *    gói — trường hợp xấu nhất, để bằng không hết hạn giữa chừng (ADR 0011: tháng LỊCH, không ×30).
 */
export function licenceTripLastDayKey(
  trip: { returnAt: Date } | { latestPickupDateKey: string; packageMonths: number },
): string {
  if ('returnAt' in trip) return vnDateKey(new Date(trip.returnAt.getTime() - 1));
  const pickup = new Date(`${trip.latestPickupDateKey}T00:00:00+07:00`);
  return vnDateKey(addCalendarMonthsVn(pickup, trip.packageMonths));
}

/** Kết quả soát bằng lái cho MỘT chuyến — mỗi giá trị khác `ok` ứng với một mã lỗi API. */
export const DRIVER_LICENCE_TRIP_GATE = {
  OK: 'ok',
  /** Chưa có bằng đã xác thực (chưa nộp, bị từ chối, lượt nộp bỏ dở). */
  MISSING: 'missing',
  /** Có lượt nộp đang chờ người duyệt — chưa đặt được, nhưng không phải nộp lại. */
  PENDING_REVIEW: 'pending_review',
  /** Bằng hết hạn trước ngày cuối của chuyến. */
  EXPIRED: 'expired',
  /** Hạng không lái được loại xe này. */
  CLASS_MISMATCH: 'class_mismatch',
} as const;

export type DriverLicenceTripGate =
  (typeof DRIVER_LICENCE_TRIP_GATE)[keyof typeof DRIVER_LICENCE_TRIP_GATE];

/**
 * Mã lỗi API của từng kết quả soát (trừ `ok`) — MỘT bảng cho server (ném lỗi) và các client (nhận
 * ra lỗi bằng lái để đưa khách về bước bằng lái). Hai bản chép tay sẽ lệch nhau ở mã thứ năm.
 */
export const DRIVER_LICENCE_GATE_ERROR_CODE = {
  [DRIVER_LICENCE_TRIP_GATE.MISSING]: API_ERROR_CODE.DRIVER_LICENCE_REQUIRED,
  [DRIVER_LICENCE_TRIP_GATE.PENDING_REVIEW]: API_ERROR_CODE.DRIVER_LICENCE_PENDING_REVIEW,
  [DRIVER_LICENCE_TRIP_GATE.EXPIRED]: API_ERROR_CODE.DRIVER_LICENCE_EXPIRED,
  [DRIVER_LICENCE_TRIP_GATE.CLASS_MISMATCH]: API_ERROR_CODE.DRIVER_LICENCE_CLASS_MISMATCH,
} as const satisfies Record<Exclude<DriverLicenceTripGate, 'ok'>, string>;

/** Mã lỗi này có phải câu trả lời của cổng bằng lái không. */
export function isDriverLicenceGateErrorCode(code: string | null | undefined): boolean {
  return (
    code !== null &&
    code !== undefined &&
    (Object.values(DRIVER_LICENCE_GATE_ERROR_CODE) as string[]).includes(code)
  );
}

/** Phần của một lượt nộp mà phép soát cần — DTO của API thoả sẵn kiểu này. */
export interface DriverLicenceGateInput {
  status: DriverLicenceStatus | string;
  /** Bằng nước ngoài/quốc tế được phép "hạn chưa đọc được" — xem `licenceValidThrough`. */
  kind: DriverLicenceKind | string | null;
  expiresOn: string | null;
  noExpiry: boolean;
  coversCar: boolean;
  coversMotorbike: boolean;
}

/**
 * Soát bằng lái cho một chuyến.
 *
 * `verified` là bằng ĐANG DÙNG (dòng `verified` duy nhất của tài khoản); `latest` là lượt nộp gần
 * nhất (có thể chính là nó). Thứ tự kiểm là CÓ Ý: bằng đang dùng đủ điều kiện thì đi luôn, kể cả
 * khi khách đang nộp một bằng mới; bằng đang dùng không đủ mà có lượt mới đang chờ duyệt thì nói
 * "đang chờ duyệt" — câu đó đúng hơn "bằng hết hạn" với người vừa nộp bằng đã gia hạn.
 */
export function evaluateDriverLicenceForTrip(
  licences: { verified: DriverLicenceGateInput | null; latest: DriverLicenceGateInput | null },
  trip: { vehicleType: string | null | undefined; lastDayKey: string },
): DriverLicenceTripGate {
  const { verified, latest } = licences;
  const pending =
    latest !== null &&
    (latest.status === DRIVER_LICENCE_STATUS.PENDING_REVIEW ||
      latest.status === DRIVER_LICENCE_STATUS.PROCESSING);

  if (verified && verified.status === DRIVER_LICENCE_STATUS.VERIFIED) {
    const covers = licenceCoversVehicleType(
      { car: verified.coversCar, motorbike: verified.coversMotorbike },
      trip.vehicleType,
    );
    const valid = licenceValidThrough(verified, trip.lastDayKey);
    if (covers && valid) return DRIVER_LICENCE_TRIP_GATE.OK;
    if (pending) return DRIVER_LICENCE_TRIP_GATE.PENDING_REVIEW;
    return covers ? DRIVER_LICENCE_TRIP_GATE.EXPIRED : DRIVER_LICENCE_TRIP_GATE.CLASS_MISMATCH;
  }

  return pending ? DRIVER_LICENCE_TRIP_GATE.PENDING_REVIEW : DRIVER_LICENCE_TRIP_GATE.MISSING;
}
