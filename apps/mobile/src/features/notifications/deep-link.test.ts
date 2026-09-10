import { notificationHref, pendingNotificationPath } from './deep-link';

/**
 * Cửa kiểm của payload thông báo. `data.url` là dữ liệu ĐẾN TỪ NGOÀI — server XePrime dựng nó,
 * nhưng app không chứng minh được điều đó, và một payload giả trông giống hệt.
 *
 * Điều được khoá: chỉ route nội bộ CÓ THẬT mới mở được; mọi thứ khác trả `null` và app đứng
 * yên thay vì mở màn trắng hay một trang ngoài.
 */
const ID = '01J8XK2M5N7P9Q1R3S5T7V9W1X';

describe('notificationHref — đích hợp lệ', () => {
  it('mở đúng màn của khu khách', () => {
    expect(notificationHref('/trips')).toBe('/trips');
    expect(notificationHref(`/trips/${ID}`)).toEqual({
      pathname: '/trips/[id]',
      params: { id: ID },
    });
    expect(notificationHref(`/chat/${ID}`)).toEqual({
      pathname: '/chat/[id]',
      params: { id: ID },
    });
  });

  it('mở đúng màn của khu quản lý', () => {
    expect(notificationHref('/manage/requests')).toBe('/manage/requests');
    expect(notificationHref(`/manage/bookings/${ID}`)).toEqual({
      pathname: '/manage/bookings/[id]',
      params: { id: ID },
    });
    expect(notificationHref('/manage/bookings')).toBe('/manage/bookings');
    expect(notificationHref(`/manage/vehicles/${ID}`)).toEqual({
      pathname: '/manage/vehicles/[id]',
      params: { id: ID },
    });
    expect(notificationHref('/manage/shop')).toBe('/manage/shop');
  });

  it('bỏ query/hash — đích của thông báo không mang tham số', () => {
    expect(notificationHref('/trips?utm=x#frag')).toBe('/trips');
  });
});

describe('notificationHref — payload không hợp lệ KHÔNG điều hướng', () => {
  it('chặn URL ra ngoài XePrime', () => {
    for (const url of [
      'https://evil.example',
      'http://evil.example/trips',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      'xeprime://manage/shop',
    ]) {
      expect(notificationHref(url)).toBeNull();
    }
  });

  it('chặn đường dẫn tương đối, rỗng, và ký tự điều khiển', () => {
    for (const url of ['trips', '', ' /trips', '/trips\n', null, undefined]) {
      expect(notificationHref(url)).toBeNull();
    }
  });

  it('chặn route nội bộ KHÔNG tồn tại — đường dẫn hợp lệ vẫn có thể là màn trắng', () => {
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
  it('giữ CHUỖI (Redux cần state serialisable) và chỉ giữ cái hợp lệ', () => {
    expect(pendingNotificationPath(`/trips/${ID}`)).toBe(`/trips/${ID}`);
    expect(pendingNotificationPath('/trips?x=1')).toBe('/trips');
    expect(pendingNotificationPath('https://evil.example')).toBeNull();
    expect(pendingNotificationPath('/manage/finance')).toBeNull();
  });
});
