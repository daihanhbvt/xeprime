import { OCCUPANCY_SOURCE_TYPE } from '@xeprime/types';
import { EVENT_ICON, eventBarShowsLabel } from './event-tone';

/**
 * Một thanh event KHÔNG bao giờ được rỗng.
 *
 * Luật "thanh hẹp thì bỏ chữ, giữ icon" sinh ra cho khoá xe và bảo dưỡng — ở đó cái ổ khoá nói
 * đủ. Nhưng `EVENT_ICON` cố ý không cấp biểu tượng cho `BOOKING`: đơn thuê là trường hợp MẶC
 * ĐỊNH, cho nó một biểu tượng nữa thì mọi thanh đều có icon và icon thôi không còn nói lên điều
 * gì. Ghép hai điều đó lại, một đơn thuê gói gọn trong MỘT ngày ra một viên màu rỗng — không
 * chữ, không icon, không đọc được là gì. Web ở đúng ô đó vẫn in "DHETX4BR ·…".
 */
describe('eventBarShowsLabel', () => {
  const NARROW = 46; // thanh một ngày ở bề rộng cột tối thiểu
  const WIDE = 200;

  it('đơn thuê hẹp VẪN hiện chữ — nó không có icon để đứng thay', () => {
    const icon = EVENT_ICON[OCCUPANCY_SOURCE_TYPE.BOOKING];

    expect(icon).toBeUndefined();
    expect(eventBarShowsLabel(NARROW, icon)).toBe(true);
  });

  it('khoá xe và bảo dưỡng hẹp thì rút về ICON, không cắt chữ thành mẩu vô nghĩa', () => {
    expect(eventBarShowsLabel(NARROW, EVENT_ICON[OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE])).toBe(false);
    expect(eventBarShowsLabel(NARROW, EVENT_ICON[OCCUPANCY_SOURCE_TYPE.MAINTENANCE])).toBe(false);
    expect(eventBarShowsLabel(NARROW, EVENT_ICON[OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST])).toBe(
      false,
    );
  });

  it('thanh rộng thì mọi loại đều hiện chữ', () => {
    expect(eventBarShowsLabel(WIDE, undefined)).toBe(true);
    expect(eventBarShowsLabel(WIDE, EVENT_ICON[OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE])).toBe(true);
  });
});
