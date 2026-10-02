import type { Href } from 'expo-router';
import { isSafeNextPath } from '@xeprime/domain';
import { NOTIFICATION_ALLOWED } from '@/app-profile';

/**
 * Đường dẫn trong payload thông báo → đích điều hướng THẬT.
 *
 * `data.url` là dữ liệu ĐẾN TỪ NGOÀI. Nó do server XePrime dựng, nhưng app không có cách nào
 * chứng minh điều đó ở phía client — một payload FCM giả (project bị lộ, bản build cũ, ai đó
 * đẩy thử qua console Firebase) trông giống hệt. Nên nó được đối xử như tham số `?next=` trên
 * web: kiểm trước, điều hướng sau.
 *
 * Hai lớp kiểm, và cả hai đều cần thiết:
 *  1. `isSafeNextPath` (dùng chung với web, `@xeprime/domain`) — chặn `https://…`, `//host`,
 *     `/\host`, đường dẫn tương đối, ký tự điều khiển. Đây là lớp chống mở URL bất kỳ.
 *  2. ALLOWLIST CỦA TỪNG APP (`NOTIFICATION_ALLOWED` ở `@/app-profile`) — chỉ những route app
 *     ĐÓ thật sự có. Từ đợt tách app 25/09/2026, mỗi app một danh sách: Customer không nhận
 *     `/manage/**`, Partner không nhận đích khách. Một đường dẫn nội bộ nhưng không thuộc app
 *     vẫn là một màn trắng, và `router.push` với typed routes sẽ ném lỗi lúc chạy.
 *
 * Trả `null` = không có đích hợp lệ. Nơi gọi mở màn mặc định, KHÔNG bao giờ crash.
 *
 * Thứ tự entry QUAN TRỌNG: prefix dài đứng trước, vì phép so là so tiền tố.
 */
export function notificationHref(url: string | null | undefined): Href | null {
  if (!isSafeNextPath(url)) return null;

  // Bỏ query/hash: đích của thông báo không mang tham số, và giữ lại chỉ mở đường cho những
  // thứ không kiểm được.
  const path = url.split(/[?#]/)[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  for (const entry of NOTIFICATION_ALLOWED) {
    const prefixParts = entry.prefix.split('/');
    if (prefixParts.length > parts.length) continue;
    if (prefixParts.some((segment, i) => parts[i] !== segment)) continue;

    const href = entry.resolve(parts.slice(prefixParts.length));
    if (href) return href;
  }
  return null;
}

/**
 * Đường dẫn dạng CHUỖI để cất vào `pendingDeepLink` khi chưa đăng nhập.
 *
 * Phải cất chuỗi chứ không phải `Href`: Redux giữ state serialisable, và `enterApp()` nhận
 * đúng kiểu chuỗi. Vẫn đi qua cùng một lớp kiểm — một đường dẫn không hợp lệ không được nằm
 * chờ trong store để rồi được điều hướng tới sau khi đăng nhập.
 */
export function pendingNotificationPath(url: string | null | undefined): string | null {
  return notificationHref(url) ? (url as string).split(/[?#]/)[0]! : null;
}
