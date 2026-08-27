import {
  VEHICLE_PUBLIC_SENSITIVE_FIELDS,
  type VehicleSensitiveField,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import type { AppFormat } from '@/i18n/use-app-format';
import type { DomainLabel } from '@/i18n/domain';

export interface SensitiveChange {
  field: VehicleSensitiveField;
  label: string;
  before: string;
  after: string;
}

/**
 * Chữ mà `sensitiveChanges` cần, do nơi gọi (một component) truyền vào.
 *
 * Module này CỐ Ý không gọi hook: nó là phép so sánh, và phép so sánh phải khớp từng chi tiết
 * với `hasSensitiveChange` ở backend. Giữ nó thuần để test được mà không cần dựng provider.
 */
export interface SensitiveChangeLabels {
  /**
   * Nhãn của một trường nhạy cảm.
   *
   * Danh sách trường KHÔNG khai lại ở đây — nó là `VEHICLE_PUBLIC_SENSITIVE_FIELDS` ở
   * `packages/types`, cùng hằng số mà `vehicles.service` dùng để quyết định có đẩy xe về chờ
   * duyệt lại hay không. Chép tay sang FE là mở đường cho hộp xác nhận nói một đằng, backend
   * làm một nẻo.
   *
   * (Figma `193:2297` tóm tắt còn "giá, biển số, loại xe, ảnh đại diện" — đó là câu văn cho
   * người đọc, không phải đặc tả. Các trường còn lại vẫn kích hoạt duyệt lại.)
   */
  field: (field: VehicleSensitiveField) => string;
  /** Giá trị trống. */
  empty: string;
  /** Ảnh đại diện đã có — xem docblock của `display`. */
  imageSet: string;
  /** `{value}%` — dấu phần trăm đứng khác bên trong một số ngôn ngữ. */
  percent: (value: number | string) => string;
}

function display(
  field: VehicleSensitiveField,
  value: VehicleFormValues[VehicleSensitiveField],
  fmt: AppFormat,
  domainLabel: DomainLabel,
  labels: SensitiveChangeLabels,
) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return labels.empty;
  }
  switch (field) {
    case 'weekdayPrice':
    case 'weekendPrice':
    case 'hourlyPrice':
    case 'monthlyPrice':
    case 'withDriverDailyPrice':
    case 'withDriverInterCityPrice':
    case 'withDriverOneWayPrice':
      return fmt.money(String(value));
    case 'discountPercent':
      return labels.percent(String(value));
    case 'vehicleType':
      return domainLabel('vehicleType', String(value));
    case 'serviceTypes':
      return fmt.serviceTypes(Array.isArray(value) ? value : [String(value)]);
    // Ảnh: so URL thì đúng nhưng đọc ra vô nghĩa — chỉ nói CÓ đổi hay không.
    case 'mainImageUrl':
      return labels.imageSet;
    default:
      return String(value);
  }
}

/**
 * Khoá so sánh — MẢNG canonicalize (sort + join) giống hệt normalizer của backend
 * (`vehicles.service.ts` `hasSensitiveChange`): đổi thứ tự chọn dịch vụ KHÔNG được tính là
 * thay đổi nhạy cảm, không kéo xe public về chờ duyệt lại oan.
 */
function compareKey(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return [...value].sort().join(',');
  return String(value);
}

/**
 * Những trường nhạy cảm đã đổi giữa giá trị ban đầu và giá trị đang nhập.
 *
 * So sánh cùng công thức với backend (`hasSensitiveChange`), nên FE và BE không bao giờ bất
 * đồng về việc một thay đổi có kích hoạt duyệt lại hay không.
 */
export function sensitiveChanges(
  before: VehicleFormValues | undefined,
  after: VehicleFormValues,
  fmt: AppFormat,
  domainLabel: DomainLabel,
  labels: SensitiveChangeLabels,
): SensitiveChange[] {
  if (!before) return [];

  return VEHICLE_PUBLIC_SENSITIVE_FIELDS.flatMap((field) => {
    const previous = before[field];
    const next = after[field];
    if (compareKey(previous) === compareKey(next)) return [];

    return [
      {
        field,
        label: labels.field(field),
        before: display(field, previous, fmt, domainLabel, labels),
        after: display(field, next, fmt, domainLabel, labels),
      },
    ];
  });
}
