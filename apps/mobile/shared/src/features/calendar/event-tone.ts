import {
  BOOKING_STATUS_META,
  OCCUPANCY_SOURCE_TYPE,
  OCCUPANCY_SOURCE_TYPE_META,
  STATUS_COLOR,
  VEHICLE_BLOCK_REASON_META,
  type BookingStatus,
  type OccupancySourceType,
  type StatusColor,
  type VehicleBlockReason,
} from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import type { CalendarEvent } from './api';

/**
 * Biểu tượng theo LOẠI event — tín hiệu thứ hai bên cạnh màu.
 *
 * Web phân biệt loại bằng icon + nét viền (khoá: nét đứt) chứ không chỉ bằng màu, và lý do giữ
 * nguyên ở đây: một phần người dùng không phân biệt được xanh/đỏ, còn ngoài nắng thì gần như
 * không ai phân biệt được. Đơn thuê không có icon vì nó là trường hợp MẶC ĐỊNH — cho nó một
 * biểu tượng nữa thì mọi thanh đều có icon và icon thôi không còn nói lên điều gì.
 */
export const EVENT_ICON: Readonly<Partial<Record<OccupancySourceType, IconName>>> = {
  [OCCUPANCY_SOURCE_TYPE.MAINTENANCE]: 'construct',
  [OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE]: 'lock-closed',
  /* Đồng hồ, không phải đồng hồ cát — web dùng `ClockCircleOutlined` cho khoản giữ chỗ. */
  [OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST]: 'time-outline',
};

/**
 * Bề ngang tối thiểu để một thanh còn chở nổi CHỮ.
 *
 * 72dp là chỗ "Đinh Bá Tùng" bắt đầu hiện đủ một từ ở cỡ chữ `meta`; hẹp hơn thì chữ ra thành
 * "Đinh…" — mẩu đó không nói thêm gì so với chính cái biểu tượng bên cạnh, mà lại làm thanh trông
 * như bị hỏng.
 */
const EVENT_LABEL_MIN_W = 72;

/**
 * Thanh này có hiện CHỮ không.
 *
 * Bỏ chữ CHỈ được phép khi có biểu tượng đứng thay — và đó chính là chỗ bản trước sai. Luật cũ
 * chỉ đo bề ngang, nên một đơn thuê gói gọn trong MỘT ngày (thanh ~46dp) mất chữ mà không có gì
 * thế chỗ: `EVENT_ICON` cố ý không cấp biểu tượng cho `BOOKING` vì đơn thuê là trường hợp MẶC
 * ĐỊNH. Kết quả trên máy là một viên màu rỗng không đọc ra là cái gì, trong khi web ở đúng ô đó
 * vẫn in "DHETX4BR ·…".
 *
 * Nên: có icon thì được phép rút về icon; không có icon thì LUÔN hiện chữ, cắt đuôi như web.
 */
export function eventBarShowsLabel(width: number, icon: IconName | undefined): boolean {
  return icon === undefined || width >= EVENT_LABEL_MIN_W;
}

/**
 * Vai màu của một thanh event — QUYẾT ĐỊNH nằm ở META của `@xeprime/types`, không ở đây.
 *
 * Bảo dưỡng và khoá xe ăn màu theo LOẠI (chúng không có trạng thái đơn); đơn thuê và yêu cầu
 * thuê ăn màu theo TRẠNG THÁI, đúng thứ tự ưu tiên web dùng. CLAUDE.md mục 5 cấm bảng màu tự chế
 * trong component — file này chỉ dịch `StatusColor` sang một vai, `StatusBadge.statusTone()` mới
 * là chỗ đổi vai thành token native.
 */
export function eventStatusColor(event: Pick<CalendarEvent, 'type' | 'status'>): StatusColor {
  if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) {
    return OCCUPANCY_SOURCE_TYPE_META[OCCUPANCY_SOURCE_TYPE.MAINTENANCE].color;
  }
  if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) {
    return OCCUPANCY_SOURCE_TYPE_META[OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE].color;
  }

  const meta = event.status ? BOOKING_STATUS_META[event.status as BookingStatus] : undefined;
  if (meta) return meta.color;

  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  return typeMeta?.color ?? STATUS_COLOR.NEUTRAL;
}

/** Vai màu của một LÝ DO khoá xe — bảng quyết định vẫn là `VEHICLE_BLOCK_REASON_META`. */
export function blockReasonColor(reason: VehicleBlockReason): StatusColor {
  return VEHICLE_BLOCK_REASON_META[reason]?.color ?? STATUS_COLOR.NEUTRAL;
}

/**
 * Nhóm nhãn để tra trạng thái của một event — `event.status` mang HAI nghĩa tuỳ loại.
 *
 * Contract nói thẳng điều đó (`CalendarEventDto.status`: "BookingStatus khi type=booking ·
 * VehicleBlockReason khi type=blocked_range"). Tra nhầm nhóm thì `unplanned_maintenance` rơi vào
 * bảng trạng thái đơn, không tìm thấy, và hiện ra chính cái mã đó cho người dùng. `null` = loại
 * này không có trạng thái để hiện, đúng như web.
 */
export function eventStatusGroup(
  event: Pick<CalendarEvent, 'type' | 'status'>,
): 'bookingStatus' | 'vehicleBlockReason' | null {
  if (!event.status) return null;
  if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING) return 'bookingStatus';
  if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) return 'vehicleBlockReason';
  return null;
}
