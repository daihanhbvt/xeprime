/**
 * Hợp nhất tin nhắn của một thread — luật dùng chung cho web và app native.
 *
 * Một thread nhận tin từ BA nguồn không đồng bộ với nhau: lời gọi REST đầu tiên, tin lạc quan mà
 * chính người dùng vừa gõ, và lượt refetch do Firestore/poll kích hoạt. Ba nguồn đó đến theo thứ
 * tự bất kỳ và chồng lấn nhau, nên "gộp tin nhắn" là LUẬT chứ không phải một tiện ích trình bày:
 * viết lại nó lần thứ hai cho app native nghĩa là hai client sẽ bất đồng về việc tin nào là trùng.
 *
 * Framework-free có chủ đích (`@xeprime/domain`): không React, không state — chỉ hàm thuần, nên
 * mọi luật ở đây kiểm được bằng unit test thay vì bằng cách bấm thử giao diện.
 */
import { CHAT_SIDE, SENDER_TYPE } from '@xeprime/types';
import { ulid } from 'ulid';

/**
 * Khoá idempotency cho một lần gửi tin — sinh ở CLIENT, gửi kèm trong body.
 *
 * Ở đây chứ không ở mỗi app: nó là nửa client của một bất biến mà nửa kia là unique DB
 * `(conversation_id, client_message_id)`. Hai app tự chọn cách sinh id là mở đường cho một bên
 * dùng thứ không đủ ngẫu nhiên (`Date.now()`), và khi đó hai người gửi cùng mili-giây sẽ nuốt
 * mất tin của nhau — server sẽ coi tin thứ hai là bản gửi lại của tin thứ nhất.
 *
 * ULID chứ không UUID: nó sắp xếp được theo thời gian, nên id tạm của tin lạc quan nằm đúng thứ
 * tự với nhau khi nhiều tin cùng bay trong một giây.
 */
export function newClientMessageId(): string {
  return ulid();
}

/** Phần một tin nhắn mà việc hợp nhất cần biết. Cố ý HẸP hơn `ChatMessage` của contract. */
export interface ThreadMessageLike {
  id: string;
  sentAt: string;
  clientMessageId?: string | null;
}

/** Vòng đời một tin do CHÍNH người dùng gửi, trước khi server xác nhận. */
export const CHAT_SEND_STATE = {
  /** Đang bay — hiện mờ, đã nằm đúng chỗ trong dòng thời gian. */
  PENDING: 'pending',
  /** Server đã nhận. Đây là trạng thái của mọi tin đến từ REST/realtime. */
  SENT: 'sent',
  /** Gửi hỏng — GIỮ LẠI trong danh sách để người dùng bấm thử lại, không xoá âm thầm. */
  FAILED: 'failed',
} as const;

export type ChatSendState = (typeof CHAT_SEND_STATE)[keyof typeof CHAT_SEND_STATE];

export interface ThreadMessage<T extends ThreadMessageLike> {
  message: T;
  state: ChatSendState;
}

/**
 * So sánh thứ tự hai tin: `sentAt` trước, `id` phân định khi trùng mốc.
 *
 * `id` là ULID nên so chuỗi đúng bằng so thời gian tạo — và nó là cùng một quy tắc mà cursor
 * keyset ở server dùng (`ORDER BY sent_at, id`). Hai nơi phải khớp, nếu không tin cuối của một
 * trang và tin đầu của trang kế sẽ đảo chỗ mỗi lần tải thêm.
 */
export function compareMessages(a: ThreadMessageLike, b: ThreadMessageLike): number {
  if (a.sentAt !== b.sentAt) return a.sentAt < b.sentAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Danh tính của một tin khi hợp nhất.
 *
 * `clientMessageId` ĐỨNG TRƯỚC `id`, và đó là toàn bộ điểm mấu chốt: tin lạc quan chưa có `id`
 * của server, nên khớp theo `id` sẽ để bản lạc quan và bản thật cùng tồn tại — người gửi thấy
 * tin của mình hai lần, một mờ một rõ. Server trả `clientMessageId` về chính vì việc này.
 */
function identityOf(message: ThreadMessageLike): string {
  return message.clientMessageId ? `c:${message.clientMessageId}` : `i:${message.id}`;
}

/**
 * Gộp tin mới vào danh sách hiện có: theo danh tính, giữ thứ tự ổn định.
 *
 * Ba luật, mỗi luật chặn một lỗi đã thấy thật:
 *
 *  1. Bản của SERVER thắng bản lạc quan cùng danh tính — nó mang `id` thật, `sentAt` thật và
 *     tên người gửi; giữ bản lạc quan là giữ một cái id giả mà lần refetch sau sẽ nhân đôi.
 *  2. Tin `failed` KHÔNG bị lượt refetch xoá đi — nội dung người dùng vừa gõ còn nằm trong đó.
 *  3. Kết quả LUÔN được sắp lại, không phải nối vào đuôi: một tin đến muộn qua realtime có thể
 *     cũ hơn tin cuối đang hiển thị (đồng hồ lệch, tin gửi trong lúc mất mạng), và nối đuôi sẽ
 *     đặt nó sai chỗ vĩnh viễn.
 */
export function mergeThreadMessages<T extends ThreadMessageLike>(
  current: readonly ThreadMessage<T>[],
  incoming: readonly T[],
  incomingState: ChatSendState = CHAT_SEND_STATE.SENT,
): ThreadMessage<T>[] {
  if (incoming.length === 0) return [...current];

  const byIdentity = new Map<string, ThreadMessage<T>>();
  for (const entry of current) {
    byIdentity.set(identityOf(entry.message), entry);
  }

  for (const message of incoming) {
    // `set` trên một khoá đã có sẽ THAY giá trị: bản server (có `id` thật, `sentAt` thật, tên
    // người gửi) đè lên bản lạc quan cùng danh tính thay vì nằm cạnh nó.
    byIdentity.set(identityOf(message), { message, state: incomingState });
  }

  return [...byIdentity.values()].sort((a, b) => compareMessages(a.message, b.message));
}

/** Đánh dấu một tin lạc quan là gửi hỏng — giữ nguyên chỗ và nội dung để bấm thử lại. */
export function markThreadMessageFailed<T extends ThreadMessageLike>(
  current: readonly ThreadMessage<T>[],
  clientMessageId: string,
): ThreadMessage<T>[] {
  return current.map((entry) =>
    entry.message.clientMessageId === clientMessageId
      ? { ...entry, state: CHAT_SEND_STATE.FAILED }
      : entry,
  );
}

/** Gỡ một tin lạc quan khỏi danh sách (người dùng huỷ bản gửi hỏng). */
export function removeThreadMessage<T extends ThreadMessageLike>(
  current: readonly ThreadMessage<T>[],
  clientMessageId: string,
): ThreadMessage<T>[] {
  return current.filter((entry) => entry.message.clientMessageId !== clientMessageId);
}

/**
 * Tin này có phải do PHÍA người đang xem gửi không — quyết định bong bóng trái hay phải.
 *
 * So `senderType` với BỀ MẶT, không so `senderUserId` với id người đang đăng nhập. Đó là lỗi
 * thật ở inbox gian hàng: tin do đồng nghiệp gửi có `senderUserId` khác mình, nên phép so kia vẽ
 * nó như tin của khách và cả hội thoại đọc ra ngược nghĩa. Tin hệ thống không thuộc phía nào.
 */
export function isOwnSideMessage(
  senderType: string | null | undefined,
  viewerSide: string,
): boolean {
  if (!senderType) return false;
  return viewerSide === CHAT_SIDE.CUSTOMER
    ? senderType === SENDER_TYPE.CUSTOMER
    : senderType === SENDER_TYPE.SHOP_MEMBER;
}

/** Một nhóm tin liên tiếp cùng người gửi trong cùng một ngày — đơn vị hiển thị của bong bóng chat. */
export interface ThreadGroup<T extends ThreadMessageLike> {
  key: string;
  /** Ngày (ISO `YYYY-MM-DD` theo múi giờ app) để vẽ dải phân cách. */
  day: string;
  /** Có phải nhóm ĐẦU TIÊN của ngày không — chỉ nhóm đó vẽ dải phân cách. */
  startsDay: boolean;
  /** `true` = phía người đang xem (bong bóng bên phải). */
  mine: boolean;
  senderKey: string;
  senderName: string | null;
  entries: ThreadMessage<T>[];
}

export interface GroupThreadOptions<T extends ThreadMessageLike> {
  /** Tin này thuộc phía người đang xem không — quyết định trái/phải. */
  isMine: (message: T) => boolean;
  /**
   * Khoá gộp nhóm. Ở inbox gian hàng phải gồm NGƯỜI GỬI, không chỉ phía: hai nhân viên trả lời
   * nối tiếp nhau là hai nhóm, nếu không tin của người này đội tên người kia.
   */
  senderKey: (message: T) => string;
  senderName: (message: T) => string | null;
  /** Đổi mốc ISO thành ngày theo múi giờ hiển thị — app truyền vào, domain không chọn hộ. */
  dayOf: (sentAt: string) => string;
}

/**
 * Gộp tin liên tiếp cùng người gửi, cùng ngày thành nhóm — và đánh dấu nhóm mở đầu mỗi ngày.
 *
 * Ở đây chứ không ở component vì hai client cùng cần đúng phép gộp này, và vì nó là thứ dễ viết
 * sai một cách im lặng: gộp theo "phía" thay vì theo NGƯỜI GỬI làm tin của hai nhân viên khác
 * nhau dính thành một khối mang đúng một cái tên.
 */
export function groupThreadMessages<T extends ThreadMessageLike>(
  entries: readonly ThreadMessage<T>[],
  options: GroupThreadOptions<T>,
): ThreadGroup<T>[] {
  const groups: ThreadGroup<T>[] = [];
  let seenDay: string | null = null;

  for (const entry of entries) {
    const day = options.dayOf(entry.message.sentAt);
    const senderKey = options.senderKey(entry.message);
    const last = groups[groups.length - 1];

    if (last && last.day === day && last.senderKey === senderKey) {
      last.entries.push(entry);
      continue;
    }

    groups.push({
      key: entry.message.id,
      day,
      startsDay: day !== seenDay,
      mine: options.isMine(entry.message),
      senderKey,
      senderName: options.senderName(entry.message),
      entries: [entry],
    });
    seenDay = day;
  }

  return groups;
}
