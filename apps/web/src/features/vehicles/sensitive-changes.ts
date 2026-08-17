import {
  VEHICLE_PUBLIC_SENSITIVE_FIELDS,
  serviceTypesLabel,
  type VehicleSensitiveField,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { formatMoneyVnd } from '@/lib/money';
import { vehicleTypeLabel } from './constants';

export interface SensitiveChange {
  field: VehicleSensitiveField;
  label: string;
  before: string;
  after: string;
}

/**
 * Nhãn tiếng Việt cho các trường nhạy cảm.
 *
 * Danh sách trường KHÔNG khai lại ở đây — nó là `VEHICLE_PUBLIC_SENSITIVE_FIELDS` ở
 * `packages/types`, cùng hằng số mà `vehicles.service` dùng để quyết định có đẩy xe về chờ
 * duyệt lại hay không. Chép tay sang FE là mở đường cho hộp xác nhận nói một đằng, backend
 * làm một nẻo.
 *
 * (Figma `193:2297` tóm tắt còn "giá, biển số, loại xe, ảnh đại diện" — đó là câu văn cho người
 * đọc, không phải đặc tả. Các trường còn lại vẫn kích hoạt duyệt lại.)
 */
const LABELS: Record<VehicleSensitiveField, string> = {
  weekdayPrice: 'Giá ngày thường',
  weekendPrice: 'Giá cuối tuần',
  hourlyPrice: 'Giá theo giờ',
  monthlyPrice: 'Giá tháng (thuê dài hạn)',
  withDriverDailyPrice: 'Giá/ngày có tài xế',
  discountPercent: 'Giảm giá',
  plateNumber: 'Biển số',
  vehicleType: 'Loại xe',
  serviceTypes: 'Loại dịch vụ',
  mainImageUrl: 'Ảnh đại diện',
};

const EMPTY = 'Chưa có';

function display(field: VehicleSensitiveField, value: VehicleFormValues[VehicleSensitiveField]) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return EMPTY;
  switch (field) {
    case 'weekdayPrice':
    case 'weekendPrice':
    case 'hourlyPrice':
    case 'monthlyPrice':
    case 'withDriverDailyPrice':
      return formatMoneyVnd(String(value));
    case 'discountPercent':
      return `${value}%`;
    case 'vehicleType':
      return vehicleTypeLabel(String(value));
    case 'serviceTypes':
      return serviceTypesLabel(Array.isArray(value) ? value : [String(value)]);
    // Ảnh: so URL thì đúng nhưng đọc ra vô nghĩa — chỉ nói CÓ đổi hay không.
    case 'mainImageUrl':
      return 'Đã đặt ảnh';
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
): SensitiveChange[] {
  if (!before) return [];

  return VEHICLE_PUBLIC_SENSITIVE_FIELDS.flatMap((field) => {
    const previous = before[field];
    const next = after[field];
    if (compareKey(previous) === compareKey(next)) return [];

    return [
      {
        field,
        label: LABELS[field],
        before: display(field, previous),
        after: display(field, next),
      },
    ];
  });
}
