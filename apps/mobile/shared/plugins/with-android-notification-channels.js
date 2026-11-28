const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  AndroidConfig,
} = require('expo/config-plugins');

/**
 * Hai KÊNH thông báo Android ở mức HIGH (người dùng báo 28/11/2026: Samsung A13 Android 14 không
 * bật banner lên đầu màn hình, iPhone thì có).
 *
 * Từ Android 8, việc thông báo có bật banner (heads-up) hay không do MỨC của kênh quyết định, và
 * kênh chỉ tạo được từ trong app. Server không ghi đè được: `android.priority` chỉ là ưu tiên giao
 * tin, `notificationPriority` chỉ có tác dụng ở Android 7 trở xuống. Worker gửi vào
 * `xeprime-operations` / `xeprime-messages` (`apps/worker/src/lib/fcm.ts`), nhưng app chưa từng
 * tạo hai kênh đó nên Firebase rơi về `fcm_fallback_notification_channel` mức DEFAULT: chỉ vào
 * khay, không bật lên.
 *
 * Tạo kênh trong `MainApplication.onCreate` (native) chứ không ở JS: lúc app bị kill và tin tới,
 * chính SDK Firebase vẽ thông báo mà không có JS nào chạy, nên kênh phải có sẵn từ lần mở app đầu.
 *
 * ⚠️ Mức của một kênh ĐÃ tạo không nâng lên được bằng code (Android giữ lựa chọn của người dùng).
 * Hai kênh này chưa từng tồn tại trên máy nào nên lần tạo đầu nhận đúng HIGH. Muốn đổi mức về sau
 * thì phải đổi ID kênh, ở CẢ đây lẫn `ANDROID_NOTIFICATION_CHANNEL` của `@xeprime/types`.
 *
 * Phải là plugin vì `/android` bị gitignore - sửa tay trong đó mất sau prebuild.
 */

/** Gương `ANDROID_NOTIFICATION_CHANNEL` (`packages/types/src/push.ts`) - plugin chạy lúc build, không import được package TS. */
const CHANNELS = [
  { id: 'xeprime-operations', name: 'notification_channel_operations' },
  { id: 'xeprime-messages', name: 'notification_channel_messages' },
];

/** Tên kênh hiện trong Cài đặt > Thông báo của máy - theo ngôn ngữ máy, mặc định tiếng Việt. */
const NAMES = {
  values: {
    notification_channel_operations: 'Đơn thuê và hoạt động',
    notification_channel_messages: 'Tin nhắn',
  },
  'values-en': {
    notification_channel_operations: 'Bookings and activity',
    notification_channel_messages: 'Messages',
  },
};

const MARKER = '// xeprime-notification-channels';

function withChannelNames(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const [folder, strings] of Object.entries(NAMES)) {
        const dir = path.join(res, folder);
        fs.mkdirSync(dir, { recursive: true });
        const items = Object.entries(strings)
          .map(([key, value]) => `  <string name="${key}">${value}</string>`)
          .join('\n');
        fs.writeFileSync(
          path.join(dir, 'notification_channels.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${items}\n</resources>\n`,
        );
      }
      return cfg;
    },
  ]);
}

function withChannelCreation(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('[with-android-notification-channels] MainApplication phải là Kotlin.');
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const calls = CHANNELS.map(
      (c) => `        "${c.id}" to R.string.${c.name},`,
    ).join('\n');
    const block = [
      `    ${MARKER}`,
      '    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {',
      '      val manager = getSystemService(android.app.NotificationManager::class.java)',
      '      listOf(',
      calls,
      '      ).forEach { (id, name) ->',
      '        val channel = android.app.NotificationChannel(',
      '          id, getString(name), android.app.NotificationManager.IMPORTANCE_HIGH',
      '        )',
      '        channel.enableVibration(true)',
      '        manager.createNotificationChannel(channel)',
      '      }',
      '    }',
    ].join('\n');

    const anchor = 'super.onCreate()';
    if (!src.includes(anchor)) {
      throw new Error('[with-android-notification-channels] Không tìm thấy super.onCreate().');
    }
    src = src.replace(anchor, `${anchor}\n${block}`);
    cfg.modResults.contents = src;
    return cfg;
  });
}

/** Tin không khai kênh (bản worker cũ, gửi thử từ console Firebase) cũng vào kênh HIGH chứ không về kênh dự phòng. */
function withDefaultChannel(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    cfg.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const key = 'com.google.firebase.messaging.default_notification_channel_id';
    app['meta-data'] = (app['meta-data'] ?? []).filter((item) => item.$['android:name'] !== key);
    app['meta-data'].push({
      $: {
        'android:name': key,
        'android:value': CHANNELS[0].id,
        // RNFirebase có thể đã khai khoá này từ firebase.json - ghi đè để không xung đột lúc gộp manifest.
        'tools:replace': 'android:value',
      },
    });
    return cfg;
  });
}

module.exports = function withAndroidNotificationChannels(config) {
  return withDefaultChannel(withChannelCreation(withChannelNames(config)));
};
