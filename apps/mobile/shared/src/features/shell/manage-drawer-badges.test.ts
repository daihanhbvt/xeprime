import { PERMISSION } from '@xeprime/types';
import { resolveSections } from './manage-menu';
import { PARTNER_TRACK } from './partner-track';
import { MANAGE_NAV_BADGE } from './manage-nav';
import type { ManageNavBadgeCounts } from './use-manage-nav-badges';

/**
 * Huy hiệu DỒN lên nhãn khối khi khối gập lại (web `hiddenCount` / `badgeTotalOf`).
 *
 * Không có nó thì gập "Vận hành" là mất luôn dấu hiệu có yêu cầu đang chờ — trong khi hạn phản hồi
 * vẫn đang chạy. Đây là lỗi im lặng: menu trông bình thường, chỉ là thiếu một con số.
 */
const BADGES: ManageNavBadgeCounts = {
  [MANAGE_NAV_BADGE.RENTALS_WORK]: 3,
  [MANAGE_NAV_BADGE.CHAT_UNREAD]: 5,
  [MANAGE_NAV_BADGE.VEHICLES_NEEDS_ACTION]: 2,
};

function section(key: string, sections: ReturnType<typeof resolveSections>) {
  return sections.find((entry) => entry.section.key === key);
}

describe('dồn huy hiệu lên nhãn khối', () => {
  const sections = resolveSections(PARTNER_TRACK.PACKAGE, () => true, {}, BADGES, true);

  it('"Vận hành" mang số của "Đơn thuê xe"', () => {
    expect(section('operations', sections)?.badge).toBe(3);
  });

  it('"Xe & Tài xế" mang số xe cần xử lý', () => {
    expect(section('fleet', sections)?.badge).toBe(2);
  });

  it('tin nhắn KHÔNG dồn vào khối nào - nó là icon ở thanh trên', () => {
    const total = sections.reduce((sum, entry) => sum + entry.badge, 0);
    expect(total).toBe(5);
  });

  it('khẩn ở một mục thì nhãn khối cũng khẩn', () => {
    const urgent = resolveSections(PARTNER_TRACK.PACKAGE, () => true, {}, BADGES, true, {
      [MANAGE_NAV_BADGE.RENTALS_WORK]: true,
    });
    expect(section('operations', urgent)?.urgent).toBe(true);
    expect(section('fleet', urgent)?.urgent).toBe(false);
  });

  it('mục ẩn không được vẽ nhưng vẫn khớp đường dẫn', () => {
    const operations = section('operations', sections);
    const drawn = operations?.nodes.map((node) => (node.kind === 'leaf' ? node.leaf.key : ''));
    expect(drawn).toEqual(['bookings', 'calendar', 'customers']);
    expect(operations?.allLeaves.map((leaf) => leaf.key)).toContain('bookings-ended');
  });

  /** Mục KHÔNG có quyền xem thì số của nó không dồn lên. */
  it('thiếu cả hai quyền yêu cầu/đơn: "Đơn thuê xe" vắng và số của nó không dồn', () => {
    const limited = resolveSections(
      PARTNER_TRACK.PACKAGE,
      (permission) =>
        permission !== PERMISSION.BOOKING_REQUEST_VIEW && permission !== PERMISSION.BOOKING_VIEW,
      {},
      BADGES,
      true,
    );
    expect(section('operations', limited)?.badge ?? 0).toBe(0);
  });

  it('có MỘT trong hai quyền là thấy "Đơn thuê xe"', () => {
    const requestsOnly = resolveSections(
      PARTNER_TRACK.PACKAGE,
      (permission) => permission !== PERMISSION.BOOKING_VIEW,
      {},
      BADGES,
      true,
    );
    expect(section('operations', requestsOnly)?.badge).toBe(3);
  });

  it('ví chỉ hiện cho CHỦ', () => {
    const member = resolveSections(PARTNER_TRACK.PACKAGE, () => true, {}, BADGES, false);
    const revenue = section('revenue', member)?.nodes.map((node) =>
      node.kind === 'leaf' ? node.leaf.key : '',
    );
    expect(revenue).not.toContain('balance');
  });
});
