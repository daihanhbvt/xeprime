/** Một tấm ảnh vừa chụp trong app — chưa nén, chưa đặt tên. */
export interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Người dùng KHÔNG cho quyền máy ảnh.
 *
 * Lớp riêng chứ không phải `null`: "đóng màn không chụp" và "bị từ chối quyền" cần hai phản hồi
 * khác hẳn — huỷ thì im lặng, từ chối quyền thì phải nói ra, nếu không họ chạm mãi vào một nút
 * không bao giờ mở gì và tưởng app hỏng.
 *
 * KHÔNG dùng thẳng `ImagePermissionDeniedError` của `src/lib/r2-image-upload.ts`: file đó import
 * file này, nên mượn ngược lại là một vòng import. Nơi gọi đổi nó sang lớp kia.
 */
export class CameraPermissionDeniedError extends Error {
  constructor() {
    super('Camera permission denied');
    this.name = 'CameraPermissionDeniedError';
  }
}

type Host = () => Promise<CapturedPhoto | null>;

let host: Host | null = null;

/**
 * `InAppCameraProvider` tự cắm mình vào đây lúc mount.
 *
 * Một biến ở phạm vi module, không phải React context: người GỌI là `pickImages` —
 * một hàm async trong `src/lib/`, không phải component, nên nó không đọc được context.
 * Đưa camera vào context sẽ buộc cả tám nơi gọi phải đổi thành hook và kéo state chụp
 * ảnh lên từng màn, đúng thứ `pickImages` sinh ra để giấu đi.
 */
export function registerInAppCameraHost(next: Host | null): void {
  host = next;
}

/**
 * Mở máy ảnh TRONG app và chờ người dùng chụp. `null` = họ đóng lại mà không chụp.
 *
 * Vì sao không dùng `ImagePicker.launchCameraAsync`: nó mở app Máy ảnh của hệ điều hành và đẩy
 * XePrime xuống nền. Máy ảnh là tiến trình ngốn RAM nhất trên máy, nên Android thu hồi bộ nhớ
 * bằng cách giết activity — hoặc cả tiến trình — của app đang ở nền. Bấm OK xong, app dựng lại
 * từ đầu: màn hình trắng, rơi về route gốc, và tấm ảnh mất trắng
 * (`ImagePicker.getPendingResultAsync()` trả `null`). Đo trên Galaxy A23: logcat có `am_kill`
 * hàng loạt, và PID của app đổi giữa hai lần log.
 *
 * Chụp trong app thì XePrime KHÔNG BAO GIỜ xuống nền, nên không có gì để hệ điều hành giết.
 *
 * Ném `CameraPermissionDeniedError` khi người dùng từ chối quyền.
 */
export function captureInAppPhoto(): Promise<CapturedPhoto | null> {
  if (!host) {
    throw new Error('InAppCameraProvider chưa được mount — xem app/_layout.tsx');
  }
  return host();
}
