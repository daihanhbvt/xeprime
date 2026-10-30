const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

/**
 * Icon + màu của THÔNG BÁO ĐẨY trên Android (người dùng báo 28/10/2026: Android 16 không hiện logo).
 *
 * Khi app ở nền, chính SDK Firebase (không phải JS) vẽ thông báo, và nó lấy icon từ meta-data
 * `com.google.firebase.messaging.default_notification_icon`. Thiếu khoá đó thì nó dùng icon app
 * NHIỀU MÀU — Android 8+ tô mọi icon thanh trạng thái thành một khối trắng theo kênh alpha, nên
 * logo vàng đặc thành một ô trắng/xám trống; Android 16 còn bỏ hẳn icon không hợp lệ.
 *
 * Icon ở đây là nét TRẮNG của chính logo app (xe + chữ Y) trên nền trong suốt, tách từ
 * `xeprime-icon-foreground.png`, đủ năm mật độ. Màu nhấn = vàng thương hiệu (tô nền vòng icon ở
 * bóng thông báo mở rộng).
 *
 * Phải là plugin vì `/android` bị gitignore — sửa tay trong đó mất sau prebuild.
 */
const ICON_NAME = 'notification_icon';
const COLOR_NAME = 'notification_icon_color';
const ACCENT = '#E9AC29';
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const SOURCE_DIR = path.join(__dirname, '..', 'assets', 'images', 'notification');

function withIconFiles(config, source) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const density of DENSITIES) {
        const dir = path.join(res, `drawable-${density}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(
          path.join(SOURCE_DIR, `${source}-${density}.png`),
          path.join(dir, `${ICON_NAME}.png`),
        );
      }
      const values = path.join(res, 'values');
      fs.mkdirSync(values, { recursive: true });
      fs.writeFileSync(
        path.join(values, `${COLOR_NAME}.xml`),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="${COLOR_NAME}">${ACCENT}</color>\n</resources>\n`,
      );
      return cfg;
    },
  ]);
}

function withManifestMeta(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      'com.google.firebase.messaging.default_notification_icon',
      `@drawable/${ICON_NAME}`,
      'resource',
    );
    // RNFirebase messaging đã khai sẵn khoá màu này (giá trị từ firebase.json) — phải GHI ĐÈ bằng
    // `tools:replace`, không thì bước gộp manifest của Gradle báo xung đột và build hỏng.
    cfg.modResults.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    app["meta-data"] = (app["meta-data"] ?? []).filter(
      (item) => item.$["android:name"] !== "com.google.firebase.messaging.default_notification_color",
    );
    app["meta-data"].push({
      $: {
        "android:name": "com.google.firebase.messaging.default_notification_color",
        "android:resource": `@color/${COLOR_NAME}`,
        "tools:replace": "android:resource",
      },
    });
    return cfg;
  });
}

/**
 * `source`: bộ ảnh nguồn trong `assets/images/notification/` — `notification_icon` (app XePrime, xe + Y)
 * hoặc `notification_icon_partner` (app Partner, vô-lăng). Mỗi app một logo của CHÍNH nó.
 */
module.exports = function withAndroidNotificationIcon(config, { source = 'notification_icon' } = {}) {
  return withManifestMeta(withIconFiles(config, source));
};
