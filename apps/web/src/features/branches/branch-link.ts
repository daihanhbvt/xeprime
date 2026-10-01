import { ROUTES } from '@/constants/routes';

/**
 * Mang chi nhánh đang lọc THEO ĐƯỜNG DẪN khi điều hướng trong khu quản lý — ADR 0052.
 *
 * Vì sao là đường dẫn chứ không phải một bộ nhớ ở client: cách kia (ghi `localStorage` rồi điền
 * lại trong effect) tạo ra HAI nguồn sự thật, và URL luôn về sau một nhịp — màn hình kịp hỏi
 * server "tất cả chi nhánh", vẽ N dòng, rồi mới co lại còn 0. Không phải lỗi cài đặt mà là hệ
 * quả tất yếu của việc dữ liệu đọc một nguồn còn lựa chọn nằm ở nguồn khác.
 *
 * Mang trên link thì URL đúng NGAY TỪ request đầu tiên, nên không có gì để hoà giải và không có
 * gì để nhấp nháy. Đổi lại — và đây là chủ đích, không phải thiếu sót: mở một bookmark hay một
 * link ai đó gửi thì KHÔNG tự lọc theo lựa chọn cũ. Đường dẫn nói gì thì thấy nấy. Chính loại
 * "trạng thái vô hình" ngược lại là thứ ADR 0052 gỡ khỏi thanh trên; dựng lại nó ở client chỉ là
 * đổi chỗ giấu.
 */

/**
 * Những màn LỌC ĐƯỢC theo chi nhánh.
 *
 * Danh sách này là bản sao duy nhất của quy tắc "màn nào mang chi nhánh đi theo". Thêm màn mới
 * vào đây là đủ — không màn nào phải tự nhớ gì.
 *
 * Ngoài danh sách thì link KHÔNG mang tham số: đưa `?branchId=` vào một trang không lọc được
 * (ví điểm, khách hàng, cấu hình) là hứa một điều trang đó không làm.
 */
const BRANCH_AWARE_ROUTES: readonly string[] = [
  ROUTES.MANAGE.ROOT,
  ROUTES.MANAGE.VEHICLES,
  ROUTES.MANAGE.MAINTENANCE,
  ROUTES.MANAGE.CALENDAR,
  ROUTES.MANAGE.BOOKING_REQUESTS,
  ROUTES.MANAGE.BOOKINGS,
  ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP,
  ROUTES.MANAGE.DEBTS,
  ROUTES.MANAGE.RECEIPTS,
  ROUTES.MANAGE.FINANCE,
];

/**
 * ⚠️ NỢ ĐÃ BIẾT — huy hiệu "Yêu cầu đặt xe" và đích của nó nói hai phạm vi khác nhau.
 *
 * `ROUTES.MANAGE.BOOKING_REQUESTS` NẰM TRONG danh sách trên, tức nó ăn theo chi nhánh như mọi màn
 * khác. Nhưng nó là mục menu DUY NHẤT mang một con số, và con số đó đếm TOÀN GIAN HÀNG (ADR 0052
 * điều 7 — huy hiệu sống ở vỏ trang, hiện cả ở những màn không có ô lọc nào, nên nó không thể đổi
 * theo trang người dùng đang đứng).
 *
 * Hệ quả người dùng gặp: đang lọc Đà Nẵng ở màn Xe, huy hiệu báo "2", bấm vào ra danh sách rỗng —
 * và không có gì trên màn hình giải thích hai con số đó.
 *
 * Đã thử bỏ route này khỏi danh sách (đích toàn gian hàng cho khớp huy hiệu) nhưng hoàn lại theo
 * yêu cầu: tính nhất quán "mọi màn cùng ăn theo một chi nhánh" được ưu tiên hơn ở thời điểm này.
 * Hướng xử lý về sau, chọn MỘT: (a) đích không nhận chi nhánh từ link — bỏ lại khỏi danh sách;
 * (b) huy hiệu đổi theo chi nhánh trên URL — nhưng lúc đó con số sẽ nhảy khi đi qua màn không lọc
 * được; (c) màn đích nói rõ "huy hiệu đếm toàn gian hàng, bạn đang lọc X".
 */

export function isBranchAwareRoute(href: string): boolean {
  // So sánh phần đường dẫn: link menu là hằng trần, nhưng vẫn cắt để một `?` lọt vào không làm
  // cả quy tắc im lặng ngừng khớp.
  const path = href.split('?')[0];
  return BRANCH_AWARE_ROUTES.includes(path ?? '');
}

/**
 * Thêm `?branchId=` vào link điều hướng khi đang lọc một chi nhánh.
 *
 * Giữ nguyên link khi: không lọc chi nhánh nào, đích không lọc được theo chi nhánh, hoặc link đã
 * tự mang sẵn `branchId` (đường dẫn tự khai luôn thắng).
 */
export function withBranchParam(href: string, branchId: string | null | undefined): string {
  if (!branchId || !isBranchAwareRoute(href) || href.includes('branchId=')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}branchId=${encodeURIComponent(branchId)}`;
}

/**
 * Mang chi nhánh sang màn CHI TIẾT như một mẩu đường về — ADR 0052.
 *
 * Màn chi tiết không lọc theo chi nhánh (nó nói về đúng một chiếc xe, một phiếu), nên nó không
 * nằm trong `BRANCH_AWARE_ROUTES` và `withBranchParam` cố tình bỏ qua nó. Nhưng nút "Quay lại"
 * trên đó đẩy về danh sách bằng một đường dẫn TRẦN, nên người dùng đang lọc Cần Thơ bấm xem chi
 * tiết rồi quay ra sẽ thấy lại toàn bộ gian hàng — mất chỗ đang đứng.
 *
 * `branchId` ở đây vì thế KHÔNG phải một bộ lọc mà là chỗ xuất phát: màn chi tiết không đọc nó
 * để truy vấn, chỉ trả lại nguyên vẹn cho danh sách qua `useBranchReturnHref`.
 */
export function withBranchReturn(href: string, branchId: string | null | undefined): string {
  if (!branchId || href.includes('branchId=')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}branchId=${encodeURIComponent(branchId)}`;
}
