import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  BOOKING_STATUS_OCCUPYING,
  OCCUPANCY_SOURCE_TYPE,
  OCCUPANCY_SOURCE_TYPE_META,
  SERVICE_TYPE,
  STATUS_COLOR,
  type BookingStatus,
  type OccupancySourceType,
  type StatusColor,
} from '@xeprime/types';
import { XP_TOKENS } from '@xeprime/ui';
import { mixHex } from '@/theme/color-mix';
import { byPalette, useColors } from '@/theme/ThemeProvider';
import type { AppColors } from '@/theme/tokens';
import type { CalendarEvent } from './api';

/**
 * Bảng màu của LƯỚI LỊCH — bản native của `--xp-cal-*` và `.tone*` ở `CalendarScheduler.module.css`.
 *
 * ## Vì sao lịch cần bảng riêng thay vì dùng thẳng `statusTone()`
 *
 * `statusTone()` là bảng của VIÊN NHÃN: một viên nằm lẻ trong dòng chữ, nên nó chỉ cần nền nhạt
 * cộng chữ đậm và mọi vai màu đọc được như nhau. Lưới lịch thì xếp hàng trăm mảng màu cạnh nhau
 * trên cùng một mặt phẳng, và ở đó ba chỗ vỡ ra:
 *
 * - **Bảo dưỡng** mang `STATUS_COLOR.SPECIAL`, mà bản native cho `SPECIAL` mượn nhấn thương hiệu
 *   (gold) vì chưa có token tím. Trong một viên nhãn thì không sao; trong lưới thì thanh bảo
 *   dưỡng lẫn luôn vào nền cột hôm nay — cũng gold. Web tô nó bằng `--xp-color-event-maintenance`.
 * - **Khoá xe** mang `NEUTRAL` → xám phẳng, lẫn vào chính nền phụ của lưới. Web có
 *   `--xp-color-event-blocked` (nâu ấm) riêng cho nó.
 * - **Nền cột** phải NHẠT HƠN token gốc, nếu không nó nuốt mất thanh event. Web pha 60% bằng
 *   `color-mix`; bản native đầu tiên dùng thẳng `bg-muted` và cả lưới đậm hơn web một bậc rõ rệt.
 *
 * ## Nguồn của mỗi con số
 *
 * Vai màu vẫn do META của `@xeprime/types` quyết định (CLAUDE.md mục 5) — file này chỉ dịch vai
 * sang token, đúng vai trò của `statusColorToneClass()` bên web. Tỉ lệ pha chép nguyên từ CSS của
 * web và tính bằng {@link mixHex} chứ không viết tay thành hex, nên đổi một token gốc ở
 * `@xeprime/ui` là cả hai bên đổi theo cùng nhau.
 */

/** Phần màu trạng thái trong VIỀN của một thanh event — `35%` ở mọi `.tone*` của web. */
const BORDER_MIX = 0.35;

/** Nền lưới: cột, hàng và nét kẻ. Bốn biến `--xp-cal-*` web khai ngay trên `.scheduler`. */
export const calSurfaceOf = byPalette(
  (colors) =>
    ({
      /**
       * Nét kẻ ô — `--xp-cal-line: var(--xp-color-border)`.
       *
       * KHÔNG phải `borderSubtle`: nét đó sinh ra để ngăn hai dòng chữ trong một thẻ, và trên nền
       * trắng của lưới thì gần như không thấy — các ô ngày dính thành một mảng liền.
       */
      line: colors.border,

      /** Nền cột cuối tuần — 60% nền phụ trên nền thẻ. */
      weekendBg: mixHex(colors.surfaceMuted, colors.surface, 0.6),

      /**
       * Nền cột ngày lễ — chỉ 8% màu lỗi.
       *
       * Đỏ vì lịch Việt Nam đọc ngày nghỉ bằng màu đỏ, nhưng pha rất nhạt có chủ đích: lớp này phải
       * yếu hơn cả nền hôm nay lẫn thanh event, vì nó là ngữ cảnh chứ không phải thứ người dùng vào
       * lịch để đọc. Vì nhạt tới mức này, ngày lễ CÒN có một lá cờ ở header — màu một mình không đủ.
       */
      holidayBg: mixHex(colors.danger, colors.surface, 0.08),

      /** Nền cột hôm nay — nhấn gold ngữ nghĩa, thắng cả nền cuối tuần lẫn nền ngày lễ. */
      todayBg: colors.primaryLight,
    }) as const,
);

export interface CalendarTone {
  bg: string;
  fg: string;
  border: string;
}

function tone(fg: string, bg: string): CalendarTone {
  return { fg, bg, border: mixHex(fg, bg, BORDER_MIX) };
}

/**
 * Tám tông của web, một-đối-một.
 *
 * `neutral` là ngoại lệ duy nhất không dùng công thức viền chung: web đặt thẳng
 * `--xp-color-border-strong` cho nó, vì 35% của một màu xám trên nền xám ra đúng cái nền đó.
 */
const toneOf = byPalette(
  (colors) =>
    ({
      blue: tone(colors.info, colors.infoSurface),
      /**
       * Bậc "đang chạy" — TÁCH khỏi `blue`, không gộp như bản trước.
       *
       * `confirmed` (`INFO`) và `active` (`PROCESSING`) là hai việc khác nhau của cùng một chiếc xe:
       * một cái đã chốt lịch, một cái khách đang cầm xe đi. Gộp màu là xoá mất khác biệt DUY NHẤT
       * nhìn thấy được trên lưới. Token `color-processing` sinh ra đúng cho chỗ này.
       */
      cyan: tone(colors.processing, colors.processingSurface),
      green: tone(colors.success, colors.successSurface),
      gold: tone(colors.primaryActive, colors.primaryLight),
      orange: tone(colors.warning, colors.warningSurface),
      red: tone(colors.danger, colors.dangerSurface),
      maintenance: {
        fg: colors.eventMaintenance,
        bg: mixHex(colors.eventMaintenance, colors.surface, 0.1),
        border: mixHex(colors.eventMaintenance, colors.surface, BORDER_MIX),
      },
      blocked: {
        fg: colors.eventBlocked,
        bg: mixHex(colors.eventBlocked, colors.surface, 0.12),
        border: mixHex(colors.eventBlocked, colors.surface, 0.45),
      },
      neutral: { fg: colors.textMuted, bg: colors.surfaceMuted, border: colors.borderInput },
    }) as const satisfies Readonly<Record<string, CalendarTone>>,
);

/**
 * `StatusColor` → tông của lịch. Đây là chỗ DUY NHẤT dịch màu.
 *
 * Thanh event và ô mẫu của chú giải cùng gọi nó, nên chú giải không thể nói một màu khác với
 * lưới nữa — đúng lỗi mà web vừa sửa: "Đang thuê" có ô xanh lá trong khi thanh thật xanh dương.
 */
export function statusColorTone(color: StatusColor | undefined, colors: AppColors): CalendarTone {
  const TONE = toneOf(colors);
  switch (color) {
    case STATUS_COLOR.SUCCESS:
      return TONE.green;
    case STATUS_COLOR.WAITING:
      return TONE.gold;
    case STATUS_COLOR.WARNING:
      return TONE.orange;
    case STATUS_COLOR.DANGER:
      return TONE.red;
    case STATUS_COLOR.INFO:
      return TONE.blue;
    case STATUS_COLOR.PROCESSING:
      return TONE.cyan;
    default:
      return TONE.neutral;
  }
}

/**
 * Tông của một nguồn chiếm lịch KHÔNG phải đơn thuê.
 *
 * Bảo dưỡng và khoá xe có màu riêng của lịch (`--xp-color-event-*`, không thuộc bảng trạng
 * thái); các nguồn còn lại — hiện là khoản giữ chỗ `booking_request` — lấy màu từ META của chính
 * loại nguồn thay vì một hằng chép tay ở đây.
 */
export function sourceTone(type: OccupancySourceType, colors: AppColors): CalendarTone {
  const TONE = toneOf(colors);
  if (type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) return TONE.maintenance;
  if (type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) return TONE.blocked;
  return statusColorTone(OCCUPANCY_SOURCE_TYPE_META[type]?.color, colors);
}

/** Tông của một thanh event: LOẠI nguồn trước, rồi tới trạng thái đơn. */
/**
 * Tông của thẻ đơn / yêu cầu theo DỊCH VỤ (lịch v2, web `calendar-event-model.serviceTone`,
 * Partner-XePrime `24200:99389`, 25/11/2026): tự lái xanh `info-strong`, có tài xế hồng đỏ
 * `color-event-with-driver`, dài hạn tím `purple`; không biết dịch vụ (yêu cầu giữ chỗ khi người xem
 * không có quyền xem yêu cầu) ⇒ trung tính.
 */
export type ServiceTone = 'selfDrive' | 'withDriver' | 'longTerm' | 'neutral';

export function serviceTone(serviceType: string | null | undefined): ServiceTone {
  switch (serviceType) {
    case SERVICE_TYPE.SELF_DRIVE:
      return 'selfDrive';
    case SERVICE_TYPE.WITH_DRIVER:
      return 'withDriver';
    case SERVICE_TYPE.LONG_TERM:
      return 'longTerm';
    default:
      return 'neutral';
  }
}

const serviceToneOf = byPalette(
  (colors) =>
    ({
      selfDrive: tone(colors.infoStrong, colors.infoSurface),
      withDriver: tone(
        XP_TOKENS['color-event-with-driver'],
        mixHex(XP_TOKENS['color-event-with-driver'], colors.surface, 0.08),
      ),
      longTerm: tone(colors.purple, colors.purpleSurface),
      neutral: { fg: colors.textMuted, bg: colors.surfaceMuted, border: colors.borderInput },
    }) as const satisfies Readonly<Record<ServiceTone, CalendarTone>>,
);

export function serviceColorTone(serviceType: string | null | undefined, colors: AppColors): CalendarTone {
  return serviceToneOf(colors)[serviceTone(serviceType)];
}

/** `false` = KHÔNG chiếm lịch (yêu cầu chờ duyệt — ADR 0044 điều 1). Thiếu trường = chiếm lịch. */
export function isOccupying(event: Pick<CalendarEvent, 'occupying'>): boolean {
  return event.occupying !== false;
}

export function eventTone(
  event: Pick<CalendarEvent, 'type' | 'status' | 'serviceType' | 'occupying'>,
  colors: AppColors,
): CalendarTone {
  const type = event.type as OccupancySourceType;
  if (type === OCCUPANCY_SOURCE_TYPE.BOOKING || type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST) {
    const base = serviceColorTone(event.serviceType, colors);
    // Yêu cầu chờ duyệt: nền trắng, viền đứt màu dịch vụ (web `.eventPending`).
    return isOccupying(event) ? base : { ...base, bg: colors.surface, border: base.fg };
  }
  return sourceTone(type, colors);
}

/**
 * Event vẽ nét ĐỨT: chỗ bị giữ mà chưa phải một chuyến đang chạy — xe bị khoá thủ công và khoản
 * giữ chỗ chờ tiền. Nét đứt là tín hiệu KHÔNG dựa vào màu, và chú giải dùng lại đúng nó.
 */
/** Nét ĐỨT: khoá xe, và yêu cầu chưa chiếm lịch (chờ duyệt) — web `.eventOff` / `.eventPending`. */
export function isDashedEvent(event: Pick<CalendarEvent, 'type' | 'occupying'>): boolean {
  return event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE || !isOccupying(event);
}

/** Ba dịch vụ của chú giải lịch v2 (web `CalendarLegend.LEGEND_SERVICES`). */
export const LEGEND_SERVICES = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
  SERVICE_TYPE.LONG_TERM,
] as const;

/**
 * Trạng thái đơn ĐƯỢC CHÚ GIẢI: `BOOKING_STATUS_OCCUPYING` trừ `confirmed`.
 *
 * `confirmed` bị loại vì trong sản phẩm KHÔNG có đường nào để một đơn dừng lại ở đó: luồng bàn
 * giao đi `reserved → confirmed → active` trong cùng một transaction, nên commit xong đơn đã là
 * `active` và không ai đọc thấy chặng giữa. Chú giải một trạng thái không xảy ra chỉ làm hàng
 * chú giải dài thêm.
 *
 * Suy ra từ danh sách chiếm lịch thay vì gõ tay hai mã: thêm/bớt một trạng thái chiếm lịch ở
 * `@xeprime/types` là chú giải tự đi theo. `eventTone` KHÔNG lọc gì — dữ liệu cũ còn đơn
 * `confirmed` (seed demo) vẫn được vẽ đúng màu của nó.
 */
export const LEGEND_BOOKING_STATUSES = BOOKING_STATUS_OCCUPYING.filter(
  (status) => status !== BOOKING_STATUS.CONFIRMED,
);

/** Ba nguồn chiếm lịch không phải đơn thuê, đúng thứ tự web bày sau nhóm trạng thái đơn. */
export const LEGEND_SOURCE_TYPES: readonly OccupancySourceType[] = [
  OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST,
  OCCUPANCY_SOURCE_TYPE.MAINTENANCE,
  OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
];

/** Hai ô mẫu không đến từ bảng trạng thái: chấm giá riêng và nền cột ngày lễ. */
export const legendExtraToneOf = byPalette(
  (colors) =>
    ({
      /** Hình TRÒN, tô đặc bằng chính màu chấm giá trên ô ngày. */
      customPrice: { fg: colors.onPrimary, bg: colors.primary, border: colors.primary },
      /** Cùng nền với cột thật + viền đỏ để ô mẫu 14dp không biến mất trên nền trắng. */
      holiday: {
        fg: colors.danger,
        bg: calSurfaceOf(colors).holidayBg,
        border: mixHex(colors.danger, colors.surface, 0.4),
      },
    }) as const satisfies Readonly<Record<string, CalendarTone>>,
);

/** Nền lưới theo giao diện hiện hành. */
export function useCalSurface() {
  return calSurfaceOf(useColors());
}

/**
 * Sắc của THẺ ĐƠN lịch v2 (Figma Lịch thuê xe `24729:82244`): nền nhạt + vạch trái 4px + mã đơn
 * cùng sắc ĐẬM, theo DỊCH VỤ - cùng phép phân loại với `serviceTone`, chỉ đổi bậc màu cho đúng hex
 * Figma (`information-low/high`, `rose-25/high`, `purple-low/high`). Ô chú giải cũng tô bằng `accent`.
 */
export interface ServiceAccent {
  /** Vạch trái, mã đơn, ô chú giải. */
  accent: string;
  /** Nền thẻ trên lưới. */
  wash: string;
  /** Nền thẻ ở khối chi tiết ngày của Lịch tháng (`information-25`). */
  card: string;
}

export const serviceAccentOf = byPalette(
  (colors) =>
    ({
      selfDrive: { accent: colors.infoStrong, wash: colors.infoLow, card: colors.infoWash },
      withDriver: {
        accent: XP_TOKENS['color-event-with-driver'],
        wash: colors.roseWash,
        card: colors.roseWash,
      },
      longTerm: { accent: colors.purpleStrong, wash: colors.purpleSurface, card: colors.purpleSurface },
      neutral: { accent: colors.placeholder, wash: colors.surfaceMuted, card: colors.surfaceMuted },
    }) as const satisfies Readonly<Record<ServiceTone, ServiceAccent>>,
);

export function serviceAccent(
  serviceType: string | null | undefined,
  colors: AppColors,
): ServiceAccent {
  return serviceAccentOf(colors)[serviceTone(serviceType)];
}

/**
 * Nền ĐẶC của viên chặng trên thẻ đơn lịch v2 (Figma "Đang thuê" `success-high` #039855 · "Chờ
 * thanh toán" `warning-500` #f79009 · "Chờ giao xe" `information-high` #1570ef), chữ trắng. Tông
 * lấy từ `RENTAL_STAGE_TONE` - cùng phép phân nhóm với màn Đơn thuê.
 */
export function stageFill(
  tone: 'danger' | 'warning' | 'info' | 'success',
  colors: AppColors,
): string {
  switch (tone) {
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warningVivid;
    case 'info':
      return colors.infoStrong;
    default:
      return colors.success;
  }
}
