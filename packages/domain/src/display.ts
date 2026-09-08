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

/**
 * Nhãn nhận diện một chiếc xe: `Tên xe (biển số)`.
 *
 * Thiếu biển số thì chỉ tên; thiếu tên thì chỉ biển số; thiếu cả hai → chuỗi rỗng và nơi gọi tự
 * quyết hiển thị gạch ngang hay ẩn hẳn dòng. Ghép ở MỘT nơi vì mỗi bề mặt tự quyết cách xử lý
 * trường thiếu sẽ làm bốn màn nói về cùng một chiếc xe theo bốn cách.
 *
 * `apps/web/src/lib/vehicle-label.ts` là bản song sinh còn lại của hàm này; hợp nhất được khi web
 * đổi import — không phải việc của đợt mobile Finance.
 */
export function vehicleLabel(
  name: string | null | undefined,
  plateNumber: string | null | undefined,
): string {
  if (!name) return plateNumber ?? '';
  return plateNumber ? `${name} (${plateNumber})` : name;
}
