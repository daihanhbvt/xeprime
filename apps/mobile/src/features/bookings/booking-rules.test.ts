import {
  BOOKING_NO_SHOW_GRACE_MINUTES,
  BOOKING_STATUS,
  canTransitionBooking,
  HANDOVER_CONFIRM_BOOKING_TARGET,
  HANDOVER_TYPE,
  isBookingFinal,
  isHandoverEditable,
  isHandoverEligible,
  isNoShowGracePassed,
  HANDOVER_STATUS,
  handoverEnergyKind,
  HANDOVER_ENERGY_KIND,
  FUEL_TYPE,
} from '@xeprime/types';

/**
 * Luật vận hành một đơn thuê.
 *
 * Test ở đây không kiểm cách RENDER mà kiểm những điều kiện quyết định NÚT NÀO ĐƯỢC BÀY RA.
 * Sai một trong số chúng không hiện thành lỗi biên dịch — nó hiện thành một nút chắc chắn nhận
 * 409, hoặc tệ hơn, một nút làm đúng thứ người dùng không định làm.
 */
describe('hai quyết định bấm tay của gian hàng', () => {
  it('đơn đã giữ xe / đã xác nhận thì huỷ được', () => {
    expect(canTransitionBooking(BOOKING_STATUS.RESERVED, BOOKING_STATUS.CANCELLED)).toBe(true);
    expect(canTransitionBooking(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED)).toBe(true);
  });

  /**
   * Xe đã ở ngoài đường thì việc cần làm là gọi cho khách, không phải bấm một nút. Bảng chuyển
   * trạng thái là nguồn duy nhất — màn hình không được tự nới ra.
   */
  it('đơn ĐANG THUÊ không huỷ được nữa', () => {
    expect(canTransitionBooking(BOOKING_STATUS.ACTIVE, BOOKING_STATUS.CANCELLED)).toBe(false);
  });

  it('ba trạng thái kết thúc không có cạnh đi ra', () => {
    for (const status of [
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.NO_SHOW,
    ]) {
      expect(isBookingFinal(status)).toBe(true);
    }
  });

  /**
   * `active` và `completed` KHÔNG BAO GIỜ đặt được bằng một cú bấm — chúng là hệ quả của một lần
   * xác nhận bàn giao thật. Đây là bất biến mà một dropdown "đổi trạng thái" sẽ xoá mất.
   */
  it('không có đường nào đi thẳng tới active/completed ngoài bàn giao', () => {
    expect(HANDOVER_CONFIRM_BOOKING_TARGET[HANDOVER_TYPE.PICKUP]).toBe(BOOKING_STATUS.ACTIVE);
    expect(HANDOVER_CONFIRM_BOOKING_TARGET[HANDOVER_TYPE.RETURN]).toBe(BOOKING_STATUS.COMPLETED);
  });
});

describe('ân hạn khách không đến', () => {
  const pickupAt = '2026-09-01T10:00:00.000Z';

  it('đúng 30 phút kể từ giờ nhận theo đơn', () => {
    expect(BOOKING_NO_SHOW_GRACE_MINUTES).toBe(30);
  });

  /**
   * Cho bấm lúc 09:59 cho một chuyến hẹn 10:00 biến một cú tắc đường thành vết đen vĩnh viễn —
   * và server từ chối trước mốc, nên nút hiện ra ở đó chắc chắn nhận 409.
   */
  it('chưa tới mốc thì CHƯA được ghi nhận', () => {
    expect(isNoShowGracePassed(pickupAt, new Date('2026-09-01T10:29:00.000Z'))).toBe(false);
  });

  it('đúng mốc thì được', () => {
    expect(isNoShowGracePassed(pickupAt, new Date('2026-09-01T10:30:00.000Z'))).toBe(true);
  });
});

describe('chiều bàn giao nào mở được', () => {
  it('giao xe mở ở đơn đã giữ xe / đã xác nhận', () => {
    expect(isHandoverEligible(HANDOVER_TYPE.PICKUP, BOOKING_STATUS.RESERVED)).toBe(true);
    expect(isHandoverEligible(HANDOVER_TYPE.PICKUP, BOOKING_STATUS.CONFIRMED)).toBe(true);
    expect(isHandoverEligible(HANDOVER_TYPE.PICKUP, BOOKING_STATUS.ACTIVE)).toBe(false);
  });

  it('nhận trả CHỈ mở ở đơn đang thuê', () => {
    expect(isHandoverEligible(HANDOVER_TYPE.RETURN, BOOKING_STATUS.ACTIVE)).toBe(true);
    expect(isHandoverEligible(HANDOVER_TYPE.RETURN, BOOKING_STATUS.CONFIRMED)).toBe(false);
  });

  it('đơn đã khép không mở chiều nào', () => {
    for (const type of [HANDOVER_TYPE.PICKUP, HANDOVER_TYPE.RETURN]) {
      expect(isHandoverEligible(type, BOOKING_STATUS.COMPLETED)).toBe(false);
      expect(isHandoverEligible(type, BOOKING_STATUS.CANCELLED)).toBe(false);
      expect(isHandoverEligible(type, BOOKING_STATUS.NO_SHOW)).toBe(false);
    }
  });
});

describe('biên bản còn sửa được không', () => {
  it('nháp và chờ xác nhận thì sửa được', () => {
    expect(isHandoverEditable(HANDOVER_STATUS.DRAFT)).toBe(true);
    expect(isHandoverEditable(HANDOVER_STATUS.READY)).toBe(true);
  });

  /** `confirmed` là điểm KHÔNG QUAY LẠI — sửa KM phải đi đường điều chỉnh có lý do. */
  it('đã xác nhận là chỉ đọc', () => {
    expect(isHandoverEditable(HANDOVER_STATUS.CONFIRMED)).toBe(false);
  });
});

describe('ghi xăng hay ghi % pin', () => {
  it('chỉ xe THUẦN ĐIỆN mới ghi pin', () => {
    expect(handoverEnergyKind(FUEL_TYPE.ELECTRIC)).toBe(HANDOVER_ENERGY_KIND.BATTERY);
  });

  /** Hybrid vẫn đổ xăng — hỏi % pin ở đó là tạo dữ liệu rác. */
  it('hybrid, xăng và dầu đều ghi mức nhiên liệu', () => {
    for (const fuel of [FUEL_TYPE.HYBRID, FUEL_TYPE.GASOLINE, FUEL_TYPE.DIESEL]) {
      expect(handoverEnergyKind(fuel)).toBe(HANDOVER_ENERGY_KIND.FUEL);
    }
  });

  it('chưa khai nhiên liệu thì mặc định ghi xăng, không nổ', () => {
    expect(handoverEnergyKind(null)).toBe(HANDOVER_ENERGY_KIND.FUEL);
  });
});
