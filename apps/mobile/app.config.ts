import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Phần ĐỘNG của cấu hình app — `app.json` vẫn là bản tĩnh, file này chồng lên nó.
 *
 * Tồn tại vì đúng một lý do: Firebase Cloud Messaging cần hai file credential
 * (`google-services.json` cho Android, `GoogleService-Info.plist` cho iOS) mà repo KHÔNG được
 * chứa. Chúng khai báo project Firebase nào, và mỗi môi trường là một project khác nhau — commit
 * một bản nghĩa là mọi bản build đều bắn thông báo vào cùng một nơi.
 *
 * Hệ quả cần giữ: **thiếu file thì app vẫn chạy**, chỉ là không có push. Plugin của
 * `@react-native-firebase/*` sẽ làm `expo prebuild` CHẾT nếu được bật mà không có file, nên
 * chúng chỉ được thêm vào khi file thật sự tồn tại — chứ không phải khai cứng trong `app.json`.
 *
 * Lấy file ở đâu: `docs/push-notifications.md` §2.
 */

/** Đường dẫn mặc định; ghi đè bằng env để CI/EAS trỏ tới file giải mã ra lúc build. */
const ANDROID_CREDENTIAL = process.env.GOOGLE_SERVICES_JSON ?? './credentials/google-services.json';
const IOS_CREDENTIAL =
  process.env.GOOGLE_SERVICES_PLIST ?? './credentials/GoogleService-Info.plist';

const has = (path: string): boolean => existsSync(resolve(__dirname, path));

export default ({ config }: ConfigContext): ExpoConfig => {
  const android = has(ANDROID_CREDENTIAL);
  const ios = has(IOS_CREDENTIAL);
  const pushConfigured = android || ios;

  if (!pushConfigured) {
    // Một dòng lúc cấu hình được đọc. Người dựng bản build phải biết vì sao máy không rung —
    // im lặng ở đây nghĩa là họ đi tìm bug trong code app.
    console.warn(
      '[app.config] Chưa có google-services.json / GoogleService-Info.plist → build KHÔNG có thông báo đẩy. Xem docs/push-notifications.md §2.',
    );
  }

  return {
    ...config,
    name: config.name ?? 'XePrime',
    slug: config.slug ?? 'xeprime-mobile',
    android: {
      ...config.android,
      ...(android ? { googleServicesFile: ANDROID_CREDENTIAL } : {}),
      permissions: [
        ...(config.android?.permissions ?? []),
        // Android 13+: thông báo là quyền phải XIN lúc chạy, không còn mặc định có.
        'android.permission.POST_NOTIFICATIONS',
      ],
    },
    ios: {
      ...config.ios,
      ...(ios ? { googleServicesFile: IOS_CREDENTIAL } : {}),
      entitlements: {
        ...config.ios?.entitlements,
        /*
         * `development` cho bản dev/TestFlight nội bộ; bản lên App Store phải là `production`.
         * Sai giá trị này thì APNs im lặng từ chối token — không có lỗi nào hiện ra ở app.
         */
        'aps-environment': process.env.APS_ENVIRONMENT ?? 'development',
      },
      infoPlist: {
        ...config.ios?.infoPlist,
        // Cho phép iOS đánh thức app khi có `content-available` — cần cho thông báo im lặng và
        // cho việc xử lý payload lúc app ở nền.
        UIBackgroundModes: ['remote-notification'],
      },
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(pushConfigured
        ? ([
            '@react-native-firebase/app',
            '@react-native-firebase/messaging',
            [
              'expo-build-properties',
              {
                // RNFirebase yêu cầu static frameworks trên iOS — thiếu dòng này thì pod
                // install chạy xong và app crash lúc khởi động.
                ios: { useFrameworks: 'static' },
              },
            ],
          ] as NonNullable<ExpoConfig['plugins']>)
        : []),
    ],
  };
};
