import type { Href } from 'expo-router';
import { isSafeNextPath } from '@xeprime/domain';
import { ROUTES } from '@/navigation/routes';

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
 *  2. ALLOWLIST dưới đây — chỉ những route app thật sự có. Một đường dẫn nội bộ nhưng không
 *     tồn tại vẫn là một màn trắng, và `router.push` với typed routes sẽ ném lỗi lúc chạy.
 *
 * Trả `null` = không có đích hợp lệ. Nơi gọi mở màn mặc định, KHÔNG bao giờ crash.
 */

/** ULID char(26); nới nhẹ cho mã tham chiếu nhưng vẫn cấm `/`, `?`, `..`, khoảng trắng. */
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/** `rest` là phần đứng SAU prefix: rỗng = màn danh sách, một đoạn = màn chi tiết. */
type Resolver = (rest: string[]) => Href | null;

/** Đường dẫn `/<prefix>` → danh sách, `/<prefix>/<id>` → chi tiết. Dạng phổ biến nhất. */
function listOrDetail(list: () => Href, detail: (id: string) => Href): Resolver {
  return (rest) => {
    if (rest.length === 0) return list();
    const id = rest[0];
    return rest.length === 1 && id && SEGMENT.test(id) ? detail(id) : null;
  };
}

/** Đường dẫn chỉ có đúng một dạng, không nhận đoạn nào phía sau. */
function exact(href: () => Href): Resolver {
  return (rest) => (rest.length === 0 ? href() : null);
}

/**
 * Bản đồ route được phép — khớp đúng bộ đường dẫn mà `notificationDeepLink` ở
 * `@xeprime/domain` sinh ra. Hai bên phải đi cùng nhau: thêm một đích ở server mà quên ở đây
 * thì thông báo đó bấm vào không đi đâu cả.
 *
 * Thứ tự QUAN TRỌNG: prefix dài đứng trước, vì phép so là so tiền tố.
 */
const ALLOWED: { prefix: string; resolve: Resolver }[] = [
  { prefix: 'manage/requests', resolve: exact(ROUTES.manage.requests) },
  {
    prefix: 'manage/bookings',
    resolve: listOrDetail(ROUTES.manage.bookings, ROUTES.manage.bookingDetail),
  },
  {
    prefix: 'manage/vehicles',
    resolve: listOrDetail(ROUTES.manage.vehicles, ROUTES.manage.vehicleDetail),
  },
  { prefix: 'manage/shop', resolve: exact(ROUTES.manage.shop) },
  // Đứng TRƯỚC `chat` không quan trọng (prefix khác hẳn), nhưng phải có: hội thoại của nhân viên
  // gian hàng nằm ở inbox gian hàng, và `side=customer` của `/chat/:id` sẽ bị server trả 403.
  {
    prefix: 'manage/chat',
    resolve: listOrDetail(ROUTES.manage.chat, ROUTES.manage.chatThread),
  },
  { prefix: 'trips', resolve: listOrDetail(ROUTES.booking.list, ROUTES.booking.detail) },
  { prefix: 'chat', resolve: listOrDetail(ROUTES.chat.list, ROUTES.chat.thread) },
  /*
   * Hai đích của bề mặt CHỦ XE tuyến hoa hồng (`NOTIFICATION_AUDIENCE.OWNER`): thông báo về gian
   * hàng đi tới `/account`, thông báo về xe đi tới `/account/vehicles` — bản Owner Lite trong khu
   * khách, vì họ không mở được `/manage`.
   *
   * Thiếu hai dòng này thì mọi thông báo duyệt hồ sơ và duyệt xe của chủ xe tuyến hoa hồng bấm
   * vào KHÔNG đi đâu cả — đúng cái mà docblock ở trên bảo là không được phép xảy ra.
   *
   * `exact`, không phải `listOrDetail`: `notificationDeepLink` không bao giờ gắn id vào hai đích
   * này, nên nhận thêm một đoạn phía sau là nới allowlist rộng hơn thứ nó phải bảo vệ.
   *
   * Đứng SAU `chat` và đoạn dài trước đoạn ngắn — phép so là so tiền tố.
   */
  { prefix: 'account/vehicles', resolve: exact(ROUTES.account.vehicles) },
  { prefix: 'account', resolve: exact(ROUTES.account.home) },
];

/** Đích cần đăng nhập không? Toàn bộ đích của thông báo đều cần — không có ngoại lệ hôm nay. */
export function notificationHref(url: string | null | undefined): Href | null {
  if (!isSafeNextPath(url)) return null;

  // Bỏ query/hash: đích của thông báo không mang tham số, và giữ lại chỉ mở đường cho những
  // thứ không kiểm được.
  const path = url.split(/[?#]/)[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  for (const entry of ALLOWED) {
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
