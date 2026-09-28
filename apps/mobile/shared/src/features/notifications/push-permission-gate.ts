import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { chatDebug } from '@/lib/chat-debug';

/**
 * CỬA XIN QUYỀN THÔNG BÁO — mở ở màn chính, không mở lúc đăng nhập.
 *
 * ## Vì sao cần một cái cửa
 *
 * Trước đây `usePushNotifications` xin quyền ngay khi phiên xuất hiện. Với đăng nhập bằng SĐT,
 * phiên xuất hiện đúng lúc người dùng vừa gõ xong 6 số OTP và còn đang đứng ở màn nhập mã — nên
 * hộp thoại "XePrime muốn gửi thông báo cho bạn" nhảy lên GIỮA một thao tác đăng nhập, trước khi
 * họ nhìn thấy sản phẩm một giây nào. Ở đó, câu hỏi không có nghĩa: chưa có chuyến xe nào để mà
 * báo, và câu trả lời gần như chắc chắn là "Không" — một câu trả lời VĨNH VIỄN, vì cả hai hệ
 * điều hành đều không hỏi lại lần thứ hai.
 *
 * Cửa này tách "đăng ký thiết bị" khỏi "xin quyền":
 *
 *  - **Đăng ký** vẫn chạy ngay khi có phiên — nhưng chỉ khi quyền ĐÃ có sẵn (`hasPushPermission`),
 *    nên nó im lặng tuyệt đối;
 *  - **Xin quyền** đợi tới khi người dùng đã vào được một màn chính (trang chủ marketplace, hoặc
 *    bảng điều khiển gian hàng), tức là lúc "báo về chuyến xe của bạn" là một câu có nghĩa.
 *
 * ## Vì sao là module state chứ không phải Redux
 *
 * Đây không phải trạng thái của sản phẩm mà là một sự kiện trong vòng đời tiến trình: "app đã
 * dựng xong một màn chính trong lượt chạy này". Nó không cần lưu, không cần devtools, không ai
 * đọc lại nó sau, và nó phải đọc được từ một effect chạy trước khi store kịp có gì — đưa vào
 * Redux là thêm một slice mà không một reducer nào có việc để làm.
 *
 * Mở một lần cho mỗi lượt chạy app. Cửa mở rồi thì mở luôn: hệ điều hành đã tự nhớ quyết định của
 * người dùng, nên mọi lượt sau là no-op ở tầng native.
 */
let open = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): boolean {
  return open;
}

/** Người dùng đã vào một màn chính — từ giờ được phép hỏi quyền thông báo. */
export function openPushPermissionGate(): void {
  if (open) return;
  open = true;
  chatDebug.pushGateOpened();
  for (const listener of listeners) listener();
}

/** Chỉ dùng trong test — trả cửa về trạng thái đóng. */
export function resetPushPermissionGate(): void {
  open = false;
  listeners.clear();
}

export function usePushPermissionGateOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Bao lâu sau khi màn chính hiện ra thì mới hỏi.
 *
 * Không phải trang trí: hộp thoại bật lên cùng lúc màn hình đang dựng thì người dùng chưa kịp
 * thấy mình đang ở đâu, và câu hỏi lại trở thành một cái chắn ngang vô cớ — đúng cái đang phải
 * sửa. Một nhịp ngắn là đủ để trang chủ vẽ xong và câu hỏi có ngữ cảnh.
 */
const GATE_DELAY_MS = 1_500;

/**
 * Cắm vào một MÀN CHÍNH (trang chủ marketplace, bảng điều khiển gian hàng) để mở cửa.
 *
 * Hai màn vì hai tuyến người dùng hạ cánh ở hai nơi khác nhau (ADR 0040): khách và chủ xe tuyến
 * hoa hồng vào marketplace, gian hàng trả gói vào khu quản lý. Chỉ cắm ở trang chủ thì một chủ
 * gian hàng sẽ không bao giờ được hỏi, và đó là người CẦN thông báo nhất.
 */
export function useOpenPushPermissionGate(): void {
  useEffect(() => {
    const timer = setTimeout(openPushPermissionGate, GATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}
