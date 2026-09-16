/**
 * Enum của Chat (Phase 5, ADR 0005 + ADR 0009).
 *
 * PostgreSQL là source of truth; các union này là hợp đồng giữa api ↔ web ↔ worker cho các
 * cột String của bảng `conversation_participants`/`messages`/`message_outbox`.
 * `CONVERSATION_STATUS` (open/closed/flagged/archived) nằm ở `misc.ts` — dùng lại, không lặp.
 */

/**
 * BỀ MẶT chat mà người xem đang đứng — trục phân tách hai hộp thư, không phải một bộ lọc giao diện.
 *
 * Một tài khoản có thể vừa là KHÁCH thuê xe của shop khác, vừa là nhân viên của shop mình. Hai
 * vai đó là hai hộp thư khác nhau (`/chat` và `/manage/chat`) và trộn chúng là để chủ shop đọc
 * thấy hội thoại riêng của chính họ nằm lẫn trong inbox công việc. Giá trị này đi TRONG query của
 * `GET /conversations` và là BẮT BUỘC: không có đường nào ở server sinh ra một danh sách trộn.
 */
export const CHAT_SIDE = {
  CUSTOMER: 'customer',
  SHOP: 'shop',
} as const;

export type ChatSide = (typeof CHAT_SIDE)[keyof typeof CHAT_SIDE];

export const CHAT_SIDE_VALUES = Object.values(CHAT_SIDE) as ChatSide[];

export function isChatSide(value: unknown): value is ChatSide {
  return typeof value === 'string' && (CHAT_SIDE_VALUES as string[]).includes(value);
}

/**
 * HỘP THƯ mà người xem đang mở — trục TRUY VẤN, khác hẳn `CHAT_SIDE` ngay trên.
 *
 * `CHAT_SIDE` trả lời "trong hội thoại NÀY tôi là ai" và nó là thuộc tính của từng dòng.
 * `CHAT_INBOX` trả lời "cho tôi xem những hội thoại nào" và nó là tham số của một lần đọc. Hai
 * câu hỏi khác nhau, nên hai union — trộn chúng lại thì `unified` sẽ trôi vào những chỗ đang
 * hỏi vai của một dòng (`participantType`, `senderType`, nhãn trên thẻ) và ở đó nó vô nghĩa.
 *
 * `UNIFIED` là hợp của đúng hai phạm vi mà người gọi ĐÃ có (`chatInboxScope`), không phải một
 * phạm vi thứ ba: nó không mở thêm hội thoại nào. Lý do nó tồn tại là chủ xe tuyến hoa hồng
 * không có cổng `/manage` để đặt hộp thư công việc — với họ, "tin nhắn" là MỘT khái niệm, và
 * bắt họ nhớ mình đang đứng ở hộp thư nào là bắt họ làm việc của hệ thống (ADR 0038 điều 9).
 *
 * Hai giá trị đầu TRÙNG giá trị của `CHAT_SIDE` có chủ đích: mọi URL, bookmark và lời gọi cũ
 * (`?side=customer`, `?side=shop`) vẫn đúng nguyên nghĩa.
 */
export const CHAT_INBOX = {
  CUSTOMER: 'customer',
  SHOP: 'shop',
  UNIFIED: 'unified',
} as const;

export type ChatInbox = (typeof CHAT_INBOX)[keyof typeof CHAT_INBOX];

export const CHAT_INBOX_VALUES = Object.values(CHAT_INBOX) as ChatInbox[];

export function isChatInbox(value: unknown): value is ChatInbox {
  return typeof value === 'string' && (CHAT_INBOX_VALUES as string[]).includes(value);
}

/** Vai trò một thành viên trong hội thoại (docs §15.3). MVP dùng customer + shop_member. */
export const PARTICIPANT_TYPE = {
  CUSTOMER: 'customer',
  SHOP_MEMBER: 'shop_member',
  PLATFORM_SUPPORT: 'platform_support',
} as const;

export type ParticipantType = (typeof PARTICIPANT_TYPE)[keyof typeof PARTICIPANT_TYPE];

export const PARTICIPANT_TYPE_VALUES = Object.values(PARTICIPANT_TYPE) as ParticipantType[];

export function isParticipantType(value: unknown): value is ParticipantType {
  return typeof value === 'string' && (PARTICIPANT_TYPE_VALUES as string[]).includes(value);
}

/** Loại nội dung một tin nhắn. `system` là tin do hệ thống sinh (vd "đã tạo đơn"). */
export const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  SYSTEM: 'system',
} as const;

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

export const MESSAGE_TYPE_VALUES = Object.values(MESSAGE_TYPE) as MessageType[];

export function isMessageType(value: unknown): value is MessageType {
  return typeof value === 'string' && (MESSAGE_TYPE_VALUES as string[]).includes(value);
}

/** Phía gửi tin — để FE render trái/phải và badge, không suy từ userId (tin hệ thống không có). */
export const SENDER_TYPE = {
  CUSTOMER: 'customer',
  SHOP_MEMBER: 'shop_member',
  PLATFORM_SUPPORT: 'platform_support',
  SYSTEM: 'system',
} as const;

export type SenderType = (typeof SENDER_TYPE)[keyof typeof SENDER_TYPE];

export const SENDER_TYPE_VALUES = Object.values(SENDER_TYPE) as SenderType[];

export function isSenderType(value: unknown): value is SenderType {
  return typeof value === 'string' && (SENDER_TYPE_VALUES as string[]).includes(value);
}

/**
 * Trạng thái bản ghi outbox (ADR 0009 §3). Worker đẩy `pending` sang Firestore rồi set `done`;
 * lỗi thì tăng attempts + lùi `nextAttemptAt`, quá ngưỡng thì `failed` để soi thủ công.
 */
export const OUTBOX_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed',
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];

export const OUTBOX_STATUS_VALUES = Object.values(OUTBOX_STATUS) as OutboxStatus[];

export function isOutboxStatus(value: unknown): value is OutboxStatus {
  return typeof value === 'string' && (OUTBOX_STATUS_VALUES as string[]).includes(value);
}
