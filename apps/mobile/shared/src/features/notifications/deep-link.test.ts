import { notificationHref, pendingNotificationPath } from './deep-link';

/**
 * Cửa kiểm của payload thông báo — phần BẤT BIẾN THEO APP. `data.url` là dữ liệu ĐẾN TỪ
 * NGOÀI: server XePrime dựng nó, nhưng app không chứng minh được điều đó, và một payload giả
 * trông giống hệt.
 *
 * File này chạy trong NGỮ CẢNH CỦA TỪNG APP (jest roots + overlay `@/app-profile`), nên nó chỉ
 * giữ những khẳng định đúng ở CẢ HAI app: mọi payload không hợp lệ đều trả `null`. Nhánh DƯƠNG
 * — app nào nhận prefix nào — nằm ở `src/app-profile.test.ts` của từng app, vì đó chính là
 * ranh giới giữa hai app.
 */
const ID = '01J8XK2M5N7P9Q1R3S5T7V9W1X';

describe('notificationHref — payload không hợp lệ KHÔNG điều hướng (mọi app)', () => {
  it('chặn URL ra ngoài XePrime', () => {
    for (const url of [
      'https://evil.example',
      'http://evil.example/trips',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      'xeprime://manage/shop',
      'xeprimepartner://manage/shop',
    ]) {
      expect(notificationHref(url)).toBeNull();
    }
  });

  it('chặn đường dẫn tương đối, rỗng, và ký tự điều khiển', () => {
    for (const url of ['trips', '', ' /trips', '/trips\n', null, undefined]) {
      expect(notificationHref(url)).toBeNull();
    }
  });

  it('chặn route nội bộ KHÔNG có trong allowlist của app nào', () => {
    for (const url of [
      '/manage/finance',
      '/manage/bookings/a/b',
      '/trips/../manage/shop',
      `/chat/${ID}/messages`,
      '/settings',
    ]) {
      expect(notificationHref(url)).toBeNull();
    }
  });

  it('chặn id không phải id — không ghép chuỗi bẩn vào đường dẫn', () => {
    expect(notificationHref('/trips/has space')).toBeNull();
    expect(notificationHref('/manage/bookings/..')).toBeNull();
  });
});

describe('pendingNotificationPath — chờ đăng nhập', () => {
  it('không bao giờ giữ một payload không hợp lệ trong store', () => {
    expect(pendingNotificationPath('https://evil.example')).toBeNull();
    expect(pendingNotificationPath('/settings')).toBeNull();
  });
});
