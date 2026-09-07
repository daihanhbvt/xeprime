/**
 * Ký hiệu trình bày dùng chung — thứ không phải CHỮ nên không nằm trong bó message.
 *
 * Một dấu ngăn giống hệt nhau ở mọi ngôn ngữ thì đưa vào `messages/<locale>/*.json` là bắt hai
 * bản dịch phải khớp nhau bằng mắt, và mở đường cho một bản đổi mà bản kia không đổi. Nó là mã,
 * và mã thì chỉ nên có một bản.
 */

/**
 * Dấu ngăn giữa các mẩu cùng MỘT dòng: `mã · biển số`, `mã đơn · SĐT`, `Tự lái · Thuê dài hạn`,
 * `Thu · Lãi`, `08:00 · 17/08`.
 *
 * Trước đây 61 chỗ ở `apps/web` và `apps/mobile` tự gõ `' · '`. Với một chuỗi ba ký tự mà ký tự
 * giữa là U+00B7 (không phải dấu chấm, không phải `•`) và hai bên là khoảng trắng, một chỗ gõ
 * lệch sẽ hiển thị sai mà không ai bắt được trong diff — và không có cách nào sửa đồng loạt nếu
 * sau này đổi ký hiệu.
 *
 * Ở `@xeprime/domain` vì cả web lẫn app native đều dùng, và package này Metro đọc được.
 */
export const LIST_SEPARATOR = ' · ';
