const { withGradleProperties } = require('expo/config-plugins');

/**
 * Ghim CỔNG METRO của bản build debug Android — mặc định React Native là 8081 cho MỌI app.
 *
 * Sau khi tách app (25/09/2026) có HAI app cài song song trên cùng một máy, mỗi app một Metro.
 * Không có plugin này thì cả hai bản debug cùng hỏi `localhost:8081`: app mở sau hoặc không tải
 * được bundle, hoặc tệ hơn là tải TRÚNG bundle của app kia và chạy sai cây route.
 *
 * `reactNativeDevServerPort` là property mà `@react-native/gradle-plugin` đọc
 * (`AgpConfiguratorUtils.configureDevServerLocation`) rồi đặt vào tài nguyên
 * `react_native_dev_server_port` của bản build.
 *
 * Phải là PLUGIN chứ không sửa tay `android/gradle.properties`: thư mục `android/` do
 * `expo prebuild` sinh ra và bị gitignore, nên mọi sửa tay trong đó mất sau lần prebuild kế
 * tiếp — cùng lý do với `with-android-gradle-jvmargs`.
 */
const PROPERTY = 'reactNativeDevServerPort';

module.exports = function withAndroidDevServerPort(config, { port } = {}) {
  const value = String(port ?? 8081);

  return withGradleProperties(config, (cfg) => {
    const properties = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === PROPERTY),
    );
    properties.push({ type: 'property', key: PROPERTY, value });
    cfg.modResults = properties;
    return cfg;
  });
};
