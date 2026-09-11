import {
  BELL_HIDDEN_NOTIFICATION_TYPES,
  CHAT_SIDE,
  MEMBERSHIP_STATUS,
  type ChatSide,
  type UserBadgeCounts,
} from '@xeprime/types';
import { Prisma } from '../generated/client';
import type { PrismaClient } from '../generated/client';

/**
 * Huy hiệu của một người — ĐẾM ở đâu, và ĐÁNH DẤU bẩn thế nào.
 *
 * Vì sao nằm ở `@xeprime/prisma` chứ không ở `apps/api` (cùng lý do với `push-outbox.ts`): có
 * HAI tiến trình cần đúng phép đếm này — API trả `GET /me/badges`, và worker chiếu
 * `user_badges/{uid}` sang Firestore. Worker cố ý không kéo runtime Nest vào nên không dùng lại
 * được `ChatService`. Bản sao thứ hai của phép đếm sẽ trôi khỏi bản gốc đúng vào lúc nguy hiểm
 * nhất: REST nói 3, Firestore nói 0, và badge nhấp nháy giữa hai con số mỗi lần đổi nguồn.
 *
 * Bảng `user_badge_signals` có MỘT chủ sở hữu là file này (kỷ luật "một writer / bảng suy diễn"):
 * mọi nơi đánh dấu bẩn đều đi qua `markBadgesDirty`, mọi nơi tiêu thụ đều đi qua `takeBadgeSignals`
 * + `clearBadgeSignal`.
 */

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Phạm vi hộp thư của MỘT bề mặt — định nghĩa DUY NHẤT của câu "hội thoại nào là của tôi".
 *
 * `ChatService.inboxWhere` chồng thêm bộ lọc tìm kiếm/chưa-đọc lên đúng cái này thay vì viết lại,
 * nên danh sách hộp thư, số chưa đọc và quyền truy cập không thể nói ba điều khác nhau.
 *
 * Phía gian hàng loại hội thoại mà CHÍNH người đó là khách: chủ shop đi thuê xe của người khác là
 * việc riêng của họ, không phải việc của hộp thư công việc.
 */
export function chatInboxScope(
  side: ChatSide,
  userId: string,
  tenantIds: readonly string[],
): Prisma.ConversationWhereInput {
  return side === CHAT_SIDE.CUSTOMER
    ? { customerUserId: userId }
    : { tenantId: { in: [...tenantIds] }, NOT: { customerUserId: userId } };
}

/** Gian hàng mà người này đang là thành viên active — phạm vi của hộp thư công việc. */
export async function activeTenantIdsOf(db: Client, userId: string): Promise<string[]> {
  const rows = await db.tenantMembership.findMany({
    where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
    select: { tenantId: true },
  });
  return rows.map((r) => r.tenantId);
}

/**
 * Chiều ngược lại: ai đang là thành viên active của gian hàng này.
 *
 * Nằm cạnh `activeTenantIdsOf` chứ không viết lại trong từng module vì nó có hai nơi gọi với hai
 * mục đích khác nhau — fan-out thông báo (loại người vừa gây ra hành động) và fan-out tín hiệu
 * huy hiệu (không loại ai) — và một trong hai bản sao quên lọc `status: active` nghĩa là người đã
 * rời gian hàng vẫn nhận thông báo công việc của nó.
 */
export async function activeMemberIdsOf(
  db: Client,
  tenantId: string,
  opts: { exclude?: readonly string[]; roleKeys?: readonly string[] } = {},
): Promise<string[]> {
  const rows = await db.tenantMembership.findMany({
    where: {
      tenantId,
      status: MEMBERSHIP_STATUS.ACTIVE,
      ...(opts.roleKeys?.length ? { roleKey: { in: [...opts.roleKeys] } } : {}),
      ...(opts.exclude?.length ? { userId: { notIn: [...opts.exclude] } } : {}),
    },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/**
 * Tin chưa đọc của một bề mặt.
 *
 * `tenantIds` chỉ có nghĩa ở vai GIAN HÀNG — nơi gọi đã có sẵn danh sách thì truyền vào để không
 * phải hỏi lại DB; vai khách bỏ qua tham số này.
 */
export async function chatUnreadOf(
  db: Client,
  userId: string,
  side: ChatSide,
  tenantIds: readonly string[] = [],
): Promise<number> {
  // Không thuộc gian hàng nào ⇒ không có hộp thư công việc. Trả 0 thay vì dựng một `IN ()`.
  if (side === CHAT_SIDE.SHOP && tenantIds.length === 0) return 0;

  const sum = await db.conversation.aggregate({
    where: {
      ...chatInboxScope(side, userId, tenantIds),
      // Điều kiện này KHÔNG chỉ để lọc: nó là thứ khớp với index một phần
      // `conversations_{tenant,customer}_unread_idx`, biến phép cộng thành index-only scan trên
      // vài dòng thay vì đọc heap toàn bộ hội thoại của gian hàng.
      ...(side === CHAT_SIDE.CUSTOMER
        ? { unreadCustomerCount: { gt: 0 } }
        : { unreadTenantCount: { gt: 0 } }),
    },
    _sum: { unreadCustomerCount: true, unreadTenantCount: true },
  });

  return (
    (side === CHAT_SIDE.CUSTOMER ? sum._sum.unreadCustomerCount : sum._sum.unreadTenantCount) ?? 0
  );
}

/**
 * Chưa đọc của CẢ HAI vai. Tách khỏi `computeUserBadges` vì `unread-summary` (app native) chỉ hỏi
 * phần chat — kéo theo một phép đếm thông báo rồi vứt đi là trả tiền cho câu trả lời không ai đọc.
 */
export async function computeChatUnread(
  db: Client,
  userId: string,
): Promise<{ customer: number; shop: number }> {
  const [tenantIds, customer] = await Promise.all([
    activeTenantIdsOf(db, userId),
    chatUnreadOf(db, userId, CHAT_SIDE.CUSTOMER),
  ]);
  const shop = await chatUnreadOf(db, userId, CHAT_SIDE.SHOP, tenantIds);
  return { customer, shop };
}

/**
 * Cả ba con số của một người.
 *
 * `notificationsUnread` loại đúng những loại KHÔNG hiện ở chuông (`BELL_HIDDEN_NOTIFICATION_TYPES`
 * — hiện là tin nhắn chat). Bắt buộc phải khớp bộ lọc của `NotificationService.list`/`unreadCount`:
 * lệch nhau thì chuông báo 3, mở ra chỉ thấy 1, và con số đó không bao giờ về 0 được vì không có
 * cách nào đọc thứ không hiện ra.
 */
export async function computeUserBadges(db: Client, userId: string): Promise<UserBadgeCounts> {
  const [chat, notificationsUnread] = await Promise.all([
    computeChatUnread(db, userId),
    db.notification.count({
      where: { userId, readAt: null, type: { notIn: [...BELL_HIDDEN_NOTIFICATION_TYPES] } },
    }),
  ]);

  return { chatCustomer: chat.customer, chatShop: chat.shop, notificationsUnread };
}

/**
 * Đánh dấu "huy hiệu của những người này vừa đổi" — gọi TRONG transaction của chính sự kiện gây
 * ra thay đổi, để tín hiệu và sự kiện cùng sống cùng chết.
 *
 * MỘT câu `INSERT … ON CONFLICT DO UPDATE`, không phải `updateMany` rồi `createMany`. Hai câu tách
 * rời có một cửa sổ thật: hai transaction cùng tạo tín hiệu ĐẦU TIÊN cho một người thì cả hai đều
 * `updateMany` trúng 0 dòng, rồi bên thua ở `createMany(skipDuplicates)` bị bỏ qua trong im lặng —
 * và số hiệu của nó không bao giờ được ghi nhận. Upsert nguyên tử thì bên thua vẫn tăng `revision`.
 *
 * `revision` tăng ngay trong câu SQL (`user_badge_signals.revision + 1`), nên nó đơn điệu theo từng
 * người mà không cần đọc trước — và hai sự kiện trong cùng một mili-giây vẫn cho hai số khác nhau.
 *
 * `sort()` KHÔNG phải để cho đẹp: Postgres khoá các dòng theo thứ tự chúng xuất hiện trong `VALUES`,
 * nên hai tin nhắn đồng thời chạm cùng tập người theo hai thứ tự khác nhau là một deadlock có thật —
 * Postgres giết một bên, và bên đó là một người dùng vừa bấm Gửi. Khoá theo thứ tự cố định thì vòng
 * chờ không thể khép lại.
 */
export async function markBadgesDirty(
  db: Client,
  userIds: readonly (string | null | undefined)[],
): Promise<void> {
  const ids = [
    ...new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ].sort();
  if (ids.length === 0) return;

  const now = new Date();
  for (let i = 0; i < ids.length; i += MARK_CHUNK) {
    await markChunk(db, ids.slice(i, i + MARK_CHUNK), now);
  }
}

/**
 * Mỗi người tốn hai tham số bind, và giao thức Postgres chặn ở 65535 tham số cho một câu lệnh.
 * Một nghìn người mỗi lô là dưới ngưỡng đó vài chục lần, đồng thời giữ số dòng bị khoá trong một
 * câu ở mức đọc được khi phải soi `pg_locks`. Chặn ở ĐÂY chứ không ở nơi gọi: mọi đường vào đều
 * được bảo vệ, kể cả một fan-out bất thường mà hôm nay chưa ai nghĩ tới.
 */
const MARK_CHUNK = 1_000;

async function markChunk(db: Client, ids: string[], now: Date): Promise<void> {
  /*
   * Ép kiểu tường minh cho từng tham số. Trong một `VALUES` lồng dưới `SELECT`, Postgres không
   * suy được kiểu cột từ bảng đích và mặc định coi tham số là `text` — lỗi 42804 ngay ở câu đầu.
   */
  const values = Prisma.join(
    ids.map((userId) => Prisma.sql`(${userId}::char(26), ${now}::timestamptz)`),
  );

  await db.$executeRaw`
    INSERT INTO user_badge_signals (user_id, dirty_at, revision)
    SELECT v.user_id, v.dirty_at, 1
      FROM (VALUES ${values}) AS v(user_id, dirty_at)
      -- Thứ tự khoá dòng phải TƯỜNG MINH, không dựa vào việc planner tình cờ giữ thứ tự của
      -- danh sách VALUES: đó là điều kiện để hai transaction chạm cùng tập người không khoá chéo.
      ORDER BY v.user_id
    ON CONFLICT (user_id) DO UPDATE
      SET dirty_at = EXCLUDED.dirty_at,
          revision = user_badge_signals.revision + 1
  `;
}

export interface BadgeSignal {
  userId: string;
  /** Số hiệu tại thời điểm worker LẤY — token để xoá đúng bản mình đã chiếu. */
  revision: bigint;
}

/** Lô tín hiệu cũ nhất — worker chiếu theo thứ tự ai đợi lâu nhất. */
export function takeBadgeSignals(db: Client, limit: number): Promise<BadgeSignal[]> {
  return db.userBadgeSignal.findMany({
    orderBy: { dirtyAt: 'asc' },
    take: limit,
    select: { userId: true, revision: true },
  });
}

/**
 * Tuổi của tín hiệu CŨ NHẤT đang chờ, tính bằng mili-giây. `null` = hàng đợi rỗng.
 *
 * Đây là thước đo sức khoẻ của cả đường ống: nó tăng khi worker chết, khi Firestore lỗi liên tục,
 * hoặc khi lô đầu hàng bị kẹt. Health check của worker đọc chính con số này.
 */
export async function oldestBadgeSignalAgeMs(db: Client): Promise<number | null> {
  const oldest = await db.userBadgeSignal.findFirst({
    orderBy: { dirtyAt: 'asc' },
    select: { dirtyAt: true },
  });
  return oldest ? Date.now() - oldest.dirtyAt.getTime() : null;
}

/**
 * Xoá tín hiệu SAU khi đã chiếu — chỉ khi số hiệu còn đúng bản đã lấy.
 *
 * Đó là toàn bộ cơ chế chống mất tín hiệu: một tin nhắn tới trong lúc worker đang chiếu sẽ tăng
 * `revision`, câu xoá này không khớp, và dòng ở lại cho lượt sau. Xoá theo `user_id` trần sẽ nuốt
 * mất đúng những thay đổi xảy ra ở khoảnh khắc bận nhất.
 */
export async function clearBadgeSignal(
  db: Client,
  userId: string,
  revision: bigint,
): Promise<boolean> {
  const { count } = await db.userBadgeSignal.deleteMany({ where: { userId, revision } });
  return count > 0;
}

/**
 * Đẩy một tín hiệu xuống CUỐI hàng đợi mà không làm mất nó — dùng khi chiếu thất bại.
 *
 * Không gọi `markBadgesDirty`: cái đó tăng `revision`, mà ở đây không có thay đổi dữ liệu nào cả.
 * Chỉ dời `dirty_at`, để một người lỗi bền không giữ mãi chỗ đầu hàng và chặn cả lô phía sau.
 */
export async function deferBadgeSignal(db: Client, userId: string): Promise<void> {
  await db.userBadgeSignal.updateMany({ where: { userId }, data: { dirtyAt: new Date() } });
}

/**
 * Xếp hàng chiếu lại cho MỌI người hiện đang có gì đó để hiện trên huy hiệu.
 *
 * Hai tình huống cần nó, và cả hai đều không tự khỏi:
 *
 *  1. **Rollout đầu tiên.** Những người đã có tin/thông báo chưa đọc từ trước khi tính năng này
 *     tồn tại sẽ không bao giờ có document — cho tới sự kiện kế tiếp của họ, có thể là vài tuần.
 *  2. **Bật lại `FIRESTORE_ENABLED` sau một quãng tắt.** Trong quãng đó tín hiệu vẫn được giữ
 *     (worker không dọn nữa), nhưng những thay đổi xảy ra TRƯỚC khi tính năng được bật lần đầu
 *     thì không có tín hiệu nào cả.
 *
 * Chỉ xếp hàng người có con số KHÁC 0: người không có gì để hiện thì không cần document, vì REST
 * đã trả về 0 và "không có document" cũng có nghĩa là 0. Nhờ vậy lượng việc bám theo số người
 * đang có việc dở, không theo tổng số tài khoản.
 *
 * Idempotent — chạy lại chỉ đẩy `dirty_at` lên, không nhân dòng. Trả về số người đã xếp hàng.
 */
export async function backfillBadgeSignals(db: Client): Promise<number> {
  /*
   * MỘT câu `INSERT … SELECT`, không kéo id nào về Node.
   *
   * Bản đầu đọc ba danh sách `distinct` rồi nhồi tất cả vào một `markBadgesDirty`. Ở quy mô thật
   * đó là hai lỗi cùng lúc: giữ toàn bộ tập người dùng đang có việc trong bộ nhớ, và đụng trần
   * 65535 tham số bind của Postgres (hai tham số/người ⇒ hỏng ở khoảng 32 nghìn người) — mà lại
   * chạy ở MỖI lần worker khởi động. Ở đây Postgres tự quét, tự gộp, tự chèn.
   */
  return db.$executeRaw`
    INSERT INTO user_badge_signals (user_id, dirty_at, revision)
    SELECT candidates.user_id, now(), 1
      FROM (
        -- Khách đang có tin chưa đọc.
        SELECT DISTINCT c.customer_user_id AS user_id
          FROM conversations c
         WHERE c.unread_customer_count > 0 AND c.customer_user_id IS NOT NULL
        UNION
        -- Người đang có thông báo chưa đọc.
        SELECT DISTINCT n.user_id
          FROM notifications n
         WHERE n.read_at IS NULL AND n.user_id IS NOT NULL
        UNION
        -- Hộp thư gian hàng là bộ đếm DÙNG CHUNG: một hội thoại chưa đọc kéo theo cả đội.
        SELECT DISTINCT m.user_id
          FROM tenant_memberships m
         WHERE m.status = ${MEMBERSHIP_STATUS.ACTIVE}
           AND m.tenant_id IN (SELECT tenant_id FROM conversations WHERE unread_tenant_count > 0)
      ) AS candidates
      ORDER BY candidates.user_id
    ON CONFLICT (user_id) DO UPDATE
      SET dirty_at = EXCLUDED.dirty_at,
          revision = user_badge_signals.revision + 1
  `;
}
