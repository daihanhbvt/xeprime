const { withGradleProperties } = require('expo/config-plugins');

/**
 * Gỡ `--enable-native-access=ALL-UNNAMED` khỏi `org.gradle.jvmargs`.
 *
 * Template Expo SDK 54 thêm cờ này để dập cảnh báo `WARNING: A restricted method in
 * java.lang.System has been called` của JDK 24+. Nhưng JDK 21 — bản mà dự án này pin qua
 * `org.gradle.java.home`, và cũng là bản trên image build của EAS — KHÔNG hiểu cờ đó: daemon
 * Gradle chết ngay lúc khởi động, trước cả dòng log đầu tiên.
 *
 * Người ta đã gỡ nó bằng tay một lần rồi (`android/gradle.properties` hiện không còn cờ này).
 * Vấn đề là `/android` nằm trong `.gitignore` vì do `expo prebuild` sinh ra, nên cờ QUAY LẠI sau
 * mỗi `prebuild --clean` — và `prebuild --clean` chính là bước bắt buộc để nạp
 * `with-android-release-signing`. Không có plugin này thì hướng dẫn build release tự phá chính nó.
 *
 * Gỡ chứ không thay bằng giá trị khác: trên JDK 21 cờ này vô nghĩa, và cảnh báo mà nó dập chỉ
 * xuất hiện từ JDK 24+. Ngày nào dự án nâng lên JDK 24 thì xoá plugin này, đừng sửa nó.
 */

const UNSUPPORTED_FLAG_PREFIX = '--enable-native-access';

module.exports = function withAndroidGradleJvmArgs(config) {
  return withGradleProperties(config, (cfg) => {
    for (const item of cfg.modResults) {
      if (item.type !== 'property' || item.key !== 'org.gradle.jvmargs') continue;

      item.value = item.value
        .split(/\s+/)
        .filter((token) => token.length > 0 && !token.startsWith(UNSUPPORTED_FLAG_PREFIX))
        .join(' ');
    }

    return cfg;
  });
};
