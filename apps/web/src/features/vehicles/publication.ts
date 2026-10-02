import {
  applicablePublishRequirements as applicableRequirements,
  missingPublishRequirements as missingRequirements,
  PUBLISH_REQUIREMENT,
  VEHICLE_PUBLIC_STATUS,
  vehicleFieldPolicy,
  type PublishRequirement,
  type VehiclePublicationInput,
  type VehiclePublicStatus,
} from '@xeprime/types';
import {
  VEHICLE_EDIT_TAB,
  VEHICLE_MANAGE_SECTION,
  type VehicleEditTab,
  type VehicleManageSection,
} from '@/constants/routes';
import type { VehicleDetail } from './types';

/**
 * Điều kiện lên chợ — **luật nằm ở `@xeprime/types`**, file này chỉ là lối vào theo shape của web.
 *
 * Trước 14/09/2026 có hai bản: một ở đây trả khoá, một ở `VehiclesService.missingPublicFields`
 * trả câu tiếng Việt. Cả hai docblock đều ghi "sửa một bên phải sửa cả hai" — tức là đã biết
 * trước rằng chúng sẽ lệch, và khi lệch thì chủ xe thấy checklist xanh hết, bấm gửi, rồi nhận
 * 400. Giờ chỉ còn MỘT bảng luật, chạy ở cả hai phía.
 *
 * Hai thứ file này còn giữ, vì chúng phụ thuộc shape của web:
 *  - đếm ảnh từ mảng `images` đã tải về (backend đếm bằng một truy vấn);
 *  - đọc tỉnh của chi nhánh từ `VehicleDetail`.
 */

export type { PublishRequirement };
/** Tên cũ, giữ để nơi gọi không phải đổi import. */
export type PublishRequirementKey = PublishRequirement;

/** Ảnh đại diện ∪ thư viện, khử trùng theo URL — cùng phép đếm với backend. */
function distinctImageCount(vehicle: VehicleDetail): number {
  const urls = new Set<string>(vehicle.images ?? []);
  if (vehicle.mainImageUrl) urls.add(vehicle.mainImageUrl);
  return urls.size;
}

/**
 * `VehicleDetail` → lát cắt mà luật dùng chung cần.
 *
 * `branchProvinceCode` là mảnh mà bản cũ ở web KHÔNG có, và thiếu nó là một lỗi thật: backend
 * chặn gửi duyệt khi chi nhánh chưa có tỉnh (`BRANCH_LOCATION_REQUIRED`) trong khi checklist ở
 * đây báo đủ. Chủ xe bấm một nút sáng và nhận một lỗi không có trong danh sách nào.
 */
function toInput(vehicle: VehicleDetail): VehiclePublicationInput {
  return {
    vehicleType: vehicle.vehicleType,
    serviceTypes: vehicle.serviceTypes,
    weekdayPrice: vehicle.weekdayPrice,
    monthlyPrice: vehicle.monthlyPrice,
    withDriverDailyPrice: vehicle.withDriverDailyPrice,
    mainImageUrl: vehicle.mainImageUrl,
    plateNumber: vehicle.plateNumber,
    brand: vehicle.brand,
    model: vehicle.model,
    manufactureYear: vehicle.manufactureYear,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    seatCount: vehicle.seatCount,
    motorbikeCategory: vehicle.motorbikeCategory,
    fuelConsumptionCombined: vehicle.fuelConsumptionCombined,
    engineDisplacementCc: vehicle.engineDisplacementCc,
    electricRangeKm: vehicle.electricRangeKm,
    branchProvinceCode: vehicle.branch?.provinceCode ?? null,
  };
}

/**
 * Các điều kiện CÓ HIỆU LỰC với xe này, kèm trạng thái đạt/chưa đạt.
 *
 * Trả cả `met` chứ không chỉ phần còn thiếu: chủ xe cần thấy mình còn cách bao xa, không chỉ
 * thấy lỗi (Figma `65:3754` Requirements Checklist).
 */
export function publishChecklist(
  vehicle: VehicleDetail,
): { key: PublishRequirement; met: boolean }[] {
  const input = toInput(vehicle);
  const imageCount = distinctImageCount(vehicle);
  return applicableRequirements(input).map((item) => ({
    key: item.key,
    met: item.present(input, imageCount),
  }));
}

/**
 * Điều kiện lên chợ còn thiếu của một xe CHƯA TẠO — đọc thẳng từ giá trị form của wizard thêm xe
 * (30/09/2026). CÙNG bảng luật với cổng gửi duyệt ở backend, nên wizard không thể cho tạo một chiếc
 * xe mà lát sau backend từ chối đưa lên chợ.
 *
 * Bỏ qua `BRANCH_LOCATION`: tỉnh của chi nhánh nằm ở quan hệ phía server (và wizard nhanh còn mở
 * gian hàng ngay lúc lưu); ô chi nhánh đã có luật bắt buộc riêng của form.
 */
export function missingPublishRequirementsForForm(values: {
  vehicleType: string;
  serviceTypes?: readonly string[] | null;
  weekdayPrice?: unknown;
  monthlyPrice?: unknown;
  withDriverDailyPrice?: unknown;
  mainImageUrl?: string | null;
  images?: readonly string[] | null;
  media?: readonly { url: string }[] | null;
  plateNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  vehicleCatalogModelId?: string | null;
  manufactureYear?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  seatCount?: number | null;
  motorbikeCategory?: string | null;
  fuelConsumptionCombined?: unknown;
  engineDisplacementCc?: number | null;
  electricRangeKm?: number | null;
}): PublishRequirement[] {
  const urls = new Set<string>([
    ...(values.images ?? []),
    ...(values.media ?? []).map((item) => item.url),
  ]);
  if (values.mainImageUrl) urls.add(values.mainImageUrl);
  /*
   * Form chọn DÒNG XE bằng id danh mục; chữ \`model\` do backend chép từ danh mục lúc lưu. Đã chọn
   * mẫu trong danh mục nghĩa là đã có dòng xe — không được báo thiếu chỉ vì ô chữ còn trống.
   */
  const model = values.model || (values.vehicleCatalogModelId ? values.vehicleCatalogModelId : null);
  return missingRequirements({ ...values, model }, urls.size).filter(
    (key) => key !== PUBLISH_REQUIREMENT.BRANCH_LOCATION,
  );
}

/**
 * Ô CỤ THỂ còn thiếu của hai điều kiện gộp nhiều trường (danh tính · thông số năng lượng) —
 * để thông báo nêu đúng "Phân khúc xe" thay vì cả nhóm "Hãng, mẫu, năm sản xuất và số chỗ" khi
 * hãng/mẫu/năm đã điền. Cùng điều kiện với `identityReady`/`energySpecReady` của `@xeprime/types`.
 */
export type PublishGapField =
  | 'brand'
  | 'model'
  | 'manufactureYear'
  | 'seatCount'
  | 'motorbikeCategory'
  | 'fuelType'
  | 'fuelConsumptionCombined'
  | 'engineDisplacementCc'
  | 'electricRangeKm'
  | 'transmission';

export function publishGapFields(
  requirement: PublishRequirement,
  values: Parameters<typeof missingPublishRequirementsForForm>[0],
): PublishGapField[] {
  const filled = (v?: string | null) => typeof v === 'string' && v.trim() !== '';
  const policy = vehicleFieldPolicy(values.vehicleType, values.fuelType);
  const gaps: PublishGapField[] = [];
  if (requirement === PUBLISH_REQUIREMENT.IDENTITY) {
    if (!filled(values.brand)) gaps.push('brand');
    if (!filled(values.model) && !filled(values.vehicleCatalogModelId)) gaps.push('model');
    if (values.manufactureYear == null) gaps.push('manufactureYear');
    if (policy.seatCount === 'required' && values.seatCount == null) gaps.push('seatCount');
    if (policy.motorbikeCategory === 'required' && !filled(values.motorbikeCategory)) {
      gaps.push('motorbikeCategory');
    }
  } else if (requirement === PUBLISH_REQUIREMENT.ENERGY_SPEC) {
    if (!filled(values.fuelType)) return ['fuelType'];
    const empty = (v: unknown) => v == null || v === '';
    if (policy.fuelConsumption === 'required' && empty(values.fuelConsumptionCombined)) {
      gaps.push('fuelConsumptionCombined');
    }
    if (policy.engineDisplacementCc === 'required' && values.engineDisplacementCc == null) {
      gaps.push('engineDisplacementCc');
    }
    if (policy.electricRangeKm === 'required' && values.electricRangeKm == null) {
      gaps.push('electricRangeKm');
    }
    if (policy.transmission === 'required' && !filled(values.transmission)) gaps.push('transmission');
  }
  return gaps;
}

/** Khoá các điều kiện còn thiếu — rỗng nghĩa là đủ điều kiện gửi duyệt. */
export function missingPublishRequirements(vehicle: VehicleDetail): PublishRequirement[] {
  return missingRequirements(toInput(vehicle), distinctImageCount(vehicle));
}

/**
 * Cách trình bày trạng thái public cho chủ xe — dùng chung cho alert panel và banner Hồ sơ 360.
 *
 * Trả về `type` (màu) + KHOÁ message, không trả câu chữ: nơi gọi đã có bộ dịch của request và
 * dịch một chỗ. `reason` là câu do người duyệt viết — nó đi qua nguyên văn, không dịch được.
 */
export interface PublicStatusPresentation {
  type: 'success' | 'info' | 'warning' | 'error';
  /** Khoá trong `Vehicles.publish.status`. */
  key: 'pending' | 'approved' | 'rejected' | 'needsRevision' | 'hidden' | 'draft';
  /** `true` = phần mô tả ưu tiên dùng `reason` của người duyệt nếu có. */
  useReason: boolean;
}

export function publicStatusPresentation(status: VehiclePublicStatus): PublicStatusPresentation {
  switch (status) {
    case VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW:
      return { type: 'info', key: 'pending', useReason: false };
    case VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC:
      return { type: 'success', key: 'approved', useReason: false };
    case VEHICLE_PUBLIC_STATUS.REJECTED:
      return { type: 'error', key: 'rejected', useReason: true };
    case VEHICLE_PUBLIC_STATUS.NEEDS_REVISION:
      return { type: 'warning', key: 'needsRevision', useReason: true };
    case VEHICLE_PUBLIC_STATUS.HIDDEN:
      return { type: 'warning', key: 'hidden', useReason: false };
    default:
      return { type: 'info', key: 'draft', useReason: false };
  }
}

/* ─── Việc cần làm để đưa xe lên chợ ──────────────────────────────────────── */

/**
 * MỘT việc "đưa xe lên chợ" của một chiếc xe — `null` = không có việc nào.
 *
 * Trước 23/09/2026, câu chuyện lên chợ chỉ sống ở thẻ xét duyệt nằm gần cuối trang, trong khi
 * thẻ "Việc cần làm" ở đầu trang có thể nói "Không có việc cần làm" cho một chiếc xe còn là
 * NHÁP. Hai khối trên cùng một trang nói hai điều trái ngược về cùng một xe, và khối nói SAI là
 * khối người dùng đọc trước.
 *
 * Hàm này là luật chung cho cả hai khối. Nó THUẦN và không biết chữ: trả `key` + hành động, còn
 * câu chữ do `Vehicles.publish.task` dựng ở nơi gọi (ADR 0012).
 */
export type VehiclePublicationTaskKey =
  | 'completeProfile'
  | 'readyToSubmit'
  | 'underReview'
  | 'needsRevision'
  | 'rejected'
  | 'platformHidden'
  | 'ownerPaused';

/**
 * `kind` = việc nút đó LÀM; `cta` = khoá chữ trên nút.
 *
 * Tách đôi vì cùng một hành động mang hai câu khác nhau tuỳ hoàn cảnh: `edit` là "Hoàn tất hồ
 * sơ" với xe nháp còn thiếu, và "Cập nhật hồ sơ" với xe bị trả về. Ghép chúng lại sẽ cho một
 * cái nút nói sai ở một trong hai chỗ.
 *
 * `cta` là một union ĐÓNG chứ không phải chuỗi ghép từ `key` — nhờ vậy `t()` kiểm được khoá lúc
 * biên dịch, thay vì phải ép kiểu để TypeScript thôi kêu.
 */
export type VehiclePublicationActionKind = 'edit' | 'submit' | 'viewStatus' | 'contactSupport';

export type VehiclePublicationCta =
  | 'completeProfile'
  | 'updateProfile'
  | 'submit'
  | 'resubmit'
  | 'viewStatus'
  | 'contactSupport';

export interface VehiclePublicationAction {
  kind: VehiclePublicationActionKind;
  cta: VehiclePublicationCta;
}

export interface VehiclePublicationTask {
  key: VehiclePublicationTaskKey;
  /**
   * Mức độ. `info` là GỢI Ý — nó xuống cuối danh sách việc cần làm và không được lấn át việc
   * vận hành thật (xe sắp phải giao, giấy tờ sắp hết hạn).
   */
  tone: 'critical' | 'warning' | 'info';
  primary: VehiclePublicationAction | null;
  secondary: VehiclePublicationAction | null;
  /** Điều kiện còn thiếu — rỗng khi hồ sơ đã đủ hoặc khi việc không nói về hồ sơ. */
  missing: PublishRequirement[];
  /** Câu NGƯỜI DUYỆT viết. Đi qua nguyên văn, không dịch được. */
  reason: string | null;
}

const EDIT_TO_COMPLETE: VehiclePublicationAction = { kind: 'edit', cta: 'completeProfile' };
const EDIT_TO_UPDATE: VehiclePublicationAction = { kind: 'edit', cta: 'updateProfile' };
const SUBMIT: VehiclePublicationAction = { kind: 'submit', cta: 'submit' };
const RESUBMIT: VehiclePublicationAction = { kind: 'submit', cta: 'resubmit' };
const VIEW_STATUS: VehiclePublicationAction = { kind: 'viewStatus', cta: 'viewStatus' };
const CONTACT_SUPPORT: VehiclePublicationAction = { kind: 'contactSupport', cta: 'contactSupport' };

export function vehiclePublicationTask(vehicle: VehicleDetail): VehiclePublicationTask | null {
  const status = vehicle.publicStatus as VehiclePublicStatus;
  const reason = vehicle.latestPublicReview?.reason ?? null;
  const missing = missingPublishRequirements(vehicle);
  /*
   * `submit` chỉ hiện khi checklist đã đủ: `submitForPublicReview` sẽ từ chối bằng
   * `VEHICLE_PUBLISH_INCOMPLETE` nếu không, và một cái nút chắc chắn dẫn tới lỗi là một cái nút
   * không nên vẽ ra.
   */
  const complete = missing.length === 0;

  switch (status) {
    case VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC:
      // Đã duyệt thì KHÔNG còn việc xét duyệt nào. Chỉ còn một gợi ý, và chỉ khi chính chủ xe
      // đang tắt công tắc — cái họ có thể đã quên bật lại.
      if (vehicle.marketplaceEnabled) return null;
      /*
       * KHÔNG có nút (02/10/2026): công tắc "Trên chợ" đứng ngay ở đầu cùng trang. Nút "Bật hiển
       * thị" ở đây chỉ là chỗ bấm thứ hai cho cùng một trạng thái — lời nhắc là đủ.
       */
      return task('ownerPaused', 'info', null, null, [], null);

    case VEHICLE_PUBLIC_STATUS.HIDDEN:
      // KHÔNG có đường tự phục vụ nào: `hidden` là quyết định kiểm duyệt và
      // `VEHICLE_PUBLIC_STATUS_SUBMITTABLE` đã loại nó (ADR 0048 điều 4). Lối duy nhất là hỗ trợ.
      return task('platformHidden', 'critical', CONTACT_SUPPORT, null, [], reason);

    case VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW:
      /*
       * Sửa được, và sửa là ĐỦ (24/09/2026).
       *
       * Trước đây ô này không có hành động chính nào: chủ xe nhìn thấy "đang chờ duyệt" rồi hết,
       * trong khi thứ họ cần làm — sửa nốt chỗ sai vừa phát hiện — thì không có lối vào, và kể cả
       * có tự mò tới trang sửa thì phiếu vẫn mang bản cũ. Nay mỗi lần lưu là phiếu mang bản mới,
       * nên nút sửa ở đây là một lời hứa giữ được.
       *
       * Vẫn là `info`: xe đang nằm đúng chỗ của nó, không có gì hỏng để giục.
       */
      return task('underReview', 'info', EDIT_TO_UPDATE, VIEW_STATUS, [], null);

    case VEHICLE_PUBLIC_STATUS.NEEDS_REVISION:
      return task(
        'needsRevision',
        'warning',
        EDIT_TO_UPDATE,
        complete ? RESUBMIT : null,
        missing,
        reason,
      );

    case VEHICLE_PUBLIC_STATUS.REJECTED:
      return task(
        'rejected',
        'critical',
        EDIT_TO_UPDATE,
        complete ? RESUBMIT : null,
        missing,
        reason,
      );

    case VEHICLE_PUBLIC_STATUS.ARCHIVED:
      // Xe đã lưu trữ không còn đường nào ra chợ, và không có việc gì để giục.
      return null;

    default:
      return complete
        ? task('readyToSubmit', 'warning', SUBMIT, null, [], null)
        : task('completeProfile', 'warning', EDIT_TO_COMPLETE, null, missing, null);
  }
}

function task(
  key: VehiclePublicationTaskKey,
  tone: VehiclePublicationTask['tone'],
  primary: VehiclePublicationAction | null,
  secondary: VehiclePublicationAction | null,
  missing: PublishRequirement[],
  reason: string | null,
): VehiclePublicationTask {
  return { key, tone, primary, secondary, missing, reason };
}

/**
 * Tab sửa xe chứa điều kiện còn thiếu ĐẦU TIÊN — để nút "Hoàn tất hồ sơ" mở đúng chỗ cần sửa
 * thay vì thả người dùng vào tab mặc định rồi để họ tự đi tìm.
 *
 * Không có mục nào thiếu ⇒ tab thông tin. Đây là bản đồ TRÌNH BÀY, cố ý sống ở web: backend
 * không biết màn sửa xe chia tab thế nào.
 */
const REQUIREMENT_TAB: Readonly<Record<PublishRequirement, VehicleEditTab>> = {
  // Mỗi loại giá thiếu mở ĐÚNG mục giá của dịch vụ đó (30/09/2026) — trước đây cả ba cùng về một
  // tab chung, nên chủ xe thiếu giá có tài xế phải tự tìm nhóm giá đó trong một màn dài.
  [PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]: VEHICLE_EDIT_TAB.PRICING,
  [PUBLISH_REQUIREMENT.LONG_TERM_PRICE]: VEHICLE_EDIT_TAB.PRICING,
  [PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE]: VEHICLE_EDIT_TAB.PRICING,
  [PUBLISH_REQUIREMENT.MAIN_IMAGE]: VEHICLE_EDIT_TAB.MEDIA,
  [PUBLISH_REQUIREMENT.PHOTOS]: VEHICLE_EDIT_TAB.MEDIA,
  [PUBLISH_REQUIREMENT.PLATE_NUMBER]: VEHICLE_EDIT_TAB.INFORMATION,
  [PUBLISH_REQUIREMENT.IDENTITY]: VEHICLE_EDIT_TAB.INFORMATION,
  [PUBLISH_REQUIREMENT.ENERGY_SPEC]: VEHICLE_EDIT_TAB.INFORMATION,
  [PUBLISH_REQUIREMENT.BRANCH_LOCATION]: VEHICLE_EDIT_TAB.INFORMATION,
};

/**
 * CÙNG bản đồ trên, khai bằng hệ toạ độ của khu tài khoản — mục của không gian "Quản lý xe".
 *
 * Hai khu dùng hai hệ toạ độ (tab `?tab=` vs đường dẫn mục), nên khai riêng thay vì tra một
 * bảng `tab → section`. Từ 30/09/2026 cả hai khu đều gom mọi loại giá vào MỘT mục "Giá & chính
 * sách", nên ba điều kiện giá cùng trỏ về đó.
 */
const REQUIREMENT_SECTION: Readonly<Record<PublishRequirement, VehicleManageSection>> = {
  [PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]: VEHICLE_MANAGE_SECTION.PRICING,
  [PUBLISH_REQUIREMENT.LONG_TERM_PRICE]: VEHICLE_MANAGE_SECTION.PRICING,
  [PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE]: VEHICLE_MANAGE_SECTION.PRICING,
  [PUBLISH_REQUIREMENT.MAIN_IMAGE]: VEHICLE_MANAGE_SECTION.IMAGES,
  [PUBLISH_REQUIREMENT.PHOTOS]: VEHICLE_MANAGE_SECTION.IMAGES,
  [PUBLISH_REQUIREMENT.PLATE_NUMBER]: VEHICLE_MANAGE_SECTION.INFORMATION,
  [PUBLISH_REQUIREMENT.IDENTITY]: VEHICLE_MANAGE_SECTION.INFORMATION,
  [PUBLISH_REQUIREMENT.ENERGY_SPEC]: VEHICLE_MANAGE_SECTION.INFORMATION,
  [PUBLISH_REQUIREMENT.BRANCH_LOCATION]: VEHICLE_MANAGE_SECTION.INFORMATION,
};

/**
 * Nơi cần sửa để đi tiếp, trong CẢ HAI hệ toạ độ — nơi gọi đưa nó qua
 * `useWorkspace().vehicles.part()` để ra đường dẫn của khu mình đang đứng.
 *
 * Trước 29/09/2026 hàm này trả thẳng một chuỗi `/manage/...`, nên nút "Hoàn tất hồ sơ" — thứ
 * chủ xe tuyến hoa hồng cần nhất để đưa chiếc xe đầu tiên lên chợ — dẫn họ vào cổng quản lý và
 * bị `AppShell` đá ngược về `/account`.
 */
export function publicationEditTarget(missing: PublishRequirement[]): {
  tab: VehicleEditTab;
  section: VehicleManageSection;
} {
  const first = missing[0];
  return first
    ? { tab: REQUIREMENT_TAB[first], section: REQUIREMENT_SECTION[first] }
    : { tab: VEHICLE_EDIT_TAB.INFORMATION, section: VEHICLE_MANAGE_SECTION.INFORMATION };
}
