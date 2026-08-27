/**
 * Enum của Chat (Phase 5, ADR 0005 + ADR 0009).
 *
 * PostgreSQL là source of truth; các union này là hợp đồng giữa api ↔ web ↔ worker cho các
 * cột String của bảng `conversation_participants`/`messages`/`message_outbox`.
 * `CONVERSATION_STATUS` (open/closed/flagged/archived) nằm ở `misc.ts` — dùng lại, không lặp.
 */

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
