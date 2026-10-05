import { CHAT_INBOX, CHAT_SIDE, type ChatInbox, type ChatSide } from '@xeprime/types';

/**
 * HỘP THƯ mà một bề mặt mở — nơi DUY NHẤT quyết định điều đó.
 *
 * Từ ADR 0053 mỗi site là một TÀI KHOẢN riêng, nên hộp thư chỉ còn phụ thuộc bề mặt:
 *
 *  - site khách (`/chat`) → hộp thư KHÁCH của tài khoản khách — tài khoản khách không có gian hàng
 *    nào, nên không có gì để hợp nhất;
 *  - site partner (`/chat` của site partner) → hộp thư GIAN HÀNG — cả chủ xe tuyến hoa hồng lẫn
 *    gian hàng tuyến gói. Hội thoại họ ĐI THUÊ (nếu họ cũng là khách) thuộc tài khoản khách của họ,
 *    một tài khoản khác.
 *
 * Hộp thư hợp nhất (`CHAT_INBOX.UNIFIED`) của bản trước — chủ xe hoa hồng đọc cả hai vai ở khu khách
 * — không còn đường tới ở web. Giá trị vẫn nằm trong `@xeprime/types` vì app native còn dùng.
 */
export function resolveChatInbox(surface: ChatSide): ChatInbox {
  return surface === CHAT_SIDE.CUSTOMER ? CHAT_INBOX.CUSTOMER : CHAT_INBOX.SHOP;
}
