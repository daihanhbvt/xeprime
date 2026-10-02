import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  OCCUPANCY_SOURCE_TYPE,
  type OccupancySourceType,
} from '@xeprime/types';
import { colors } from '@/theme/tokens';
import {
  CAL_SURFACE,
  eventTone,
  isDashedEvent,
  LEGEND_BOOKING_STATUSES,
  sourceTone,
  statusColorTone,
} from './calendar-tone';

/** Đủ hình cho `eventTone` — nó chỉ đọc `type` và `status`. */
const event = (type: OccupancySourceType, status?: string) =>
  ({ type, status: status ?? null }) as Parameters<typeof eventTone>[0];

/**
 * Bảng màu lưới lịch — khoá theo mô hình web hiện tại (`fix(web): sync calendar status colors
 * and legend`).
 *
 * Không có test nào ở đây so hex với một hằng viết tay: giá trị là DẪN XUẤT từ token dùng chung
 * và được phép đổi khi token đổi. Thứ KHÔNG được phép đổi là các quan hệ giữa chúng.
 */
describe('bảng màu lưới lịch', () => {
  /**
   * Ba lớp nền CỘT chồng lên nhau theo thứ tự cuối tuần < ngày lễ < hôm nay (hàng để trắng, nền
   * vằn đã bỏ ở cả web lẫn app). Hai lớp trùng màu là một lớp biến mất mà không có gì báo.
   */
  it('ba lớp nền cột phân biệt được với nhau', () => {
    const layers = [CAL_SURFACE.weekendBg, CAL_SURFACE.holidayBg, CAL_SURFACE.todayBg];

    expect(new Set(layers).size).toBe(layers.length);
  });

  it('nền cột cuối tuần nhạt hơn nền phụ gốc', () => {
    const lightness = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);

    expect(lightness(CAL_SURFACE.weekendBg)).toBeGreaterThan(lightness(colors.surfaceMuted));
    expect(lightness(CAL_SURFACE.weekendBg)).toBeLessThan(lightness(colors.surface));
  });

  /**
   * `confirmed` (`INFO`) và `active` (`PROCESSING`) là HAI việc khác nhau của cùng một chiếc xe:
   * một cái đã chốt lịch, một cái khách đang cầm xe đi. Bản trước gộp cả hai vào tông xanh dương
   * vì bảng màu native chưa có bậc "đang chạy" — và như thế là xoá mất khác biệt duy nhất nhìn
   * thấy được trên lưới. Web đã tách bằng token `color-processing`.
   */
  it('đã xác nhận và đang thuê là HAI tông khác nhau', () => {
    const confirmed = eventTone(event(OCCUPANCY_SOURCE_TYPE.BOOKING, BOOKING_STATUS.CONFIRMED));
    const active = eventTone(event(OCCUPANCY_SOURCE_TYPE.BOOKING, BOOKING_STATUS.ACTIVE));

    expect(confirmed.bg).not.toBe(active.bg);
    expect(confirmed.fg).toBe(colors.info);
    expect(active.fg).toBe(colors.processing);
  });

  /**
   * Chú giải và thanh event phải đi qua CÙNG một hàm màu.
   *
   * Đây là lỗi web vừa sửa: chú giải tô "Đang thuê" xanh lá trong khi lưới vẽ nó xanh dương, vì
   * hai bên đọc hai bảng khác nhau. Test này chặn đúng kiểu trôi đó.
   */
  it('mọi mục chú giải trạng thái dùng đúng tông của thanh event cùng trạng thái', () => {
    for (const status of LEGEND_BOOKING_STATUSES) {
      expect(statusColorTone(BOOKING_STATUS_META[status].color)).toEqual(
        eventTone(event(OCCUPANCY_SOURCE_TYPE.BOOKING, status)),
      );
    }
  });

  /**
   * `confirmed` bị loại khỏi chú giải vì không có đường nào để một đơn dừng lại ở đó; `reserved`
   * và `active` thì phải có. Suy từ `BOOKING_STATUS_OCCUPYING` nên thêm một trạng thái chiếm
   * lịch ở `@xeprime/types` là chú giải tự đi theo.
   */
  it('chú giải nêu đúng hai trạng thái chiếm lịch mà người dùng thật sự gặp', () => {
    expect([...LEGEND_BOOKING_STATUSES]).toEqual([BOOKING_STATUS.RESERVED, BOOKING_STATUS.ACTIVE]);
  });

  /**
   * Bảo dưỡng mang `STATUS_COLOR.SPECIAL`, mà bản native cho `SPECIAL` mượn nhấn thương hiệu
   * (gold) — cùng đúng cái gold của nền cột hôm nay. Trong một viên nhãn thì không sao; trên
   * lưới thì thanh bảo dưỡng tan vào nền cột và không còn đọc ra.
   */
  it('thanh bảo dưỡng không tan vào nền cột hôm nay', () => {
    const maintenance = eventTone(event(OCCUPANCY_SOURCE_TYPE.MAINTENANCE));

    expect(maintenance.bg).not.toBe(CAL_SURFACE.todayBg);
    expect(maintenance.fg).toBe(colors.eventMaintenance);
  });

  it('khoá xe ăn màu theo LOẠI, không theo trạng thái đơn', () => {
    const blocked = eventTone(event(OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE, 'maintenance'));

    expect(blocked.fg).toBe(colors.eventBlocked);
  });

  /** Khoản giữ chỗ lấy màu từ META của chính loại nguồn (`WAITING` → gold), không phải hằng tay. */
  it('chờ giữ chỗ ăn màu theo META của loại nguồn', () => {
    const held = eventTone(event(OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST));

    expect(held).toEqual(sourceTone(OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST));
    expect(held.fg).toBe(colors.primaryActive);
  });

  /**
   * Nét đứt là tín hiệu KHÔNG dựa vào màu, dành cho chỗ bị giữ mà chưa phải chuyến đang chạy.
   * Một đơn thuê thật không bao giờ đứt nét — nếu không, tín hiệu mất nghĩa.
   */
  it('chỉ khoá xe và chờ giữ chỗ vẽ nét đứt', () => {
    expect(isDashedEvent(OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE)).toBe(true);
    expect(isDashedEvent(OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST)).toBe(true);
    expect(isDashedEvent(OCCUPANCY_SOURCE_TYPE.BOOKING)).toBe(false);
    expect(isDashedEvent(OCCUPANCY_SOURCE_TYPE.MAINTENANCE)).toBe(false);
  });

  it('viền thanh event là màu trạng thái PHA LOÃNG, không phải màu chữ', () => {
    const tone = eventTone(event(OCCUPANCY_SOURCE_TYPE.BOOKING, BOOKING_STATUS.ACTIVE));

    expect(tone.border).not.toBe(tone.fg);
    expect(tone.border).not.toBe(tone.bg);
  });
});
