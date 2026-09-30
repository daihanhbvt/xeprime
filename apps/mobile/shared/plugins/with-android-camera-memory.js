const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Giữ MainActivity SỐNG trong lúc người dùng đang ở app Máy ảnh của hệ thống.
 *
 * Bệnh: `launchCameraAsync` mở Intent máy ảnh và đẩy app xuống nền. Bấm OK xong, app hiện màn
 * hình trắng rồi rơi về route gốc — MainActivity đã bị huỷ, kéo theo ReactHost nạp lại bundle và
 * navigation state chết. Đo bằng logcat thấy HAI cơ chế khác nhau cùng gây ra nó:
 *
 *  1. Android giết cả tiến trình để nhường RAM cho app Máy ảnh (PID đổi).
 *  2. Android huỷ RIÊNG activity vì một giá trị cấu hình đổi lúc quay về (PID giữ nguyên,
 *     log có `ReactHost{0}...: Loading JS Bundle` + `Packager connection already open, nooping`).
 *
 * Hai thuộc tính dưới đây chặn mỗi cơ chế một cái. Không đặt được trong `app.json`: cả hai là
 * thuộc tính AndroidManifest mà Expo không expose thành khoá cấu hình.
 */

/**
 * Bộ cấu hình activity TỰ xử lý, thay vì để Android huỷ và dựng lại mình.
 *
 * Mẫu mặc định của Expo dừng ở `uiMode`. Bốn cái thêm ở cuối mới là thứ đang thiếu:
 * `smallestScreenSize` và `density` đổi khi ROM (Samsung rất hay làm) tính lại DPI lúc chuyển
 * qua lại giữa các app toàn màn hình; `fontScale` đổi theo cỡ chữ hệ thống; `colorMode` theo
 * dải màu/HDR. Thiếu tên nào trong danh sách này thì thay đổi tương ứng = activity bị dựng lại.
 *
 * An toàn với React Native: RN không đọc tài nguyên theo qualifier của Android — layout tính lại
 * từ JS qua `Dimensions`/`useWindowDimensions`, nên tự xử lý config change KHÔNG mất gì.
 */
const CONFIG_CHANGES = [
  'keyboard',
  'keyboardHidden',
  'orientation',
  'screenSize',
  'screenLayout',
  'uiMode',
  'locale',
  'layoutDirection',
  'smallestScreenSize',
  'density',
  'fontScale',
  'navigation',
  'touchscreen',
  'colorMode',
].join('|');

module.exports = function withAndroidCameraMemory(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;

    /*
     * Nâng trần heap của tiến trình (thường 192MB → 512MB tuỳ máy) để app nằm ở nền với dấu chân
     * dưới ngưỡng bị thu hồi, sống sót qua chuyến đi sang máy ảnh. Chỉ giảm tần suất của cơ chế
     * (1), không phải lá chắn tuyệt đối trên máy RAM 2–3GB.
     */
    application.$['android:largeHeap'] = 'true';

    const main = application.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) main.$['android:configChanges'] = CONFIG_CHANGES;

    return cfg;
  });
};
