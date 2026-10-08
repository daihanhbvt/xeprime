import { CHAT_INBOX, CHAT_SIDE, type ChatInbox, type ChatSide } from '@xeprime/types';

/**
 * Hộp thư mà một BỀ MẶT hỏi server — bản native của `resolveChatInbox` bên web.
 *
 * Từ ADR 0053 mỗi tài khoản thuộc đúng một realm: tài khoản khách chỉ có hộp thư khách, tài khoản
 * đối tác (chủ xe tuyến hoa hồng lẫn gian hàng) chỉ có hộp thư gian hàng. Hộp thư HỢP NHẤT của ADR
 * 0038 điều 10 tồn tại chỉ để vá việc một tài khoản đứng hai vai — nay đã bỏ.
 */
export function resolveChatInbox(surface: ChatSide): ChatInbox {
  return surface === CHAT_SIDE.CUSTOMER ? CHAT_INBOX.CUSTOMER : CHAT_INBOX.SHOP;
}
