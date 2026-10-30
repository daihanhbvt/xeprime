import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { resolveApiBaseUrl } from '@/lib/api-base-url';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';

export type AppVersionInfo = { version: string; build: string | null };

/**
 * Phiên bản đang chạy, đọc từ cấu hình Expo NHÚNG LÚC BUILD (`app.json` → `expo.version`, kèm
 * `ios.buildNumber` / `android.versionCode`) — cùng nguồn mà `use-push-notifications` gửi lên
 * làm `appVersion`, nên con số người dùng đọc cho bộ phận hỗ trợ khớp với con số server ghi.
 *
 * `build` tách riêng vì cửa hàng phân biệt hai số: `version` là số người dùng thấy trên
 * App Store / Google Play, `build` là số tăng mỗi lần nộp bản. Thiếu thì bỏ, không bịa.
 */
export function readAppVersion(
  config: typeof Constants.expoConfig = Constants.expoConfig,
  os: typeof Platform.OS = Platform.OS,
): AppVersionInfo | null {
  const version = config?.version?.trim();
  if (!version) return null;
  const rawBuild = os === 'ios' ? config?.ios?.buildNumber : config?.android?.versionCode;
  const build = rawBuild == null || String(rawBuild).trim() === '' ? null : String(rawBuild);
  return { version, build };
}

/**
 * Dòng "Phiên bản x.y.z (n)" ở chân màn — Apple và Google đều hỏi người dùng/QA phải tìm được
 * số phiên bản ngay trong app khi báo lỗi, và đó cũng là câu đầu tiên bộ phận hỗ trợ hỏi.
 *
 * Đứng ở ba chỗ: chân màn Đăng nhập (chưa đăng nhập vẫn đọc được), chân tab Tài khoản và chân
 * "Tài khoản & bảo mật" của khu quản lý. Không có số thì không hiện gì — một dòng "Phiên bản"
 * trống còn tệ hơn không có.
 */
/** Host API production — bản trỏ vào đây là bản người dùng thật cầm. */
const PRODUCTION_API_HOST = 'api.xeprime.vn';

/**
 * Bản production chỉ hiện "0.1.0" — số build là việc nội bộ (QA, hỗ trợ phân biệt các bản nộp),
 * người dùng thật không cần (người dùng chốt 29/10/2026). Staging/dev vẫn hiện "0.1.0 (n)".
 * Push vẫn gửi đủ `readAppVersion` lên server, nên hỗ trợ tra được số build từ phía máy chủ.
 */
function isProductionBuild(): boolean {
  try {
    return new URL(resolveApiBaseUrl()).host === PRODUCTION_API_HOST;
  } catch {
    return false;
  }
}

export function AppVersion() {
  const colors = useColors();
  const t = useTranslations('MobileShell.appVersion');
  const info = readAppVersion();
  if (!info) return null;

  return (
    <YStack ai="center" py={space.sm}>
      <Text col={colors.placeholder} fos={fontSize.bodySm} selectable>
        {info.build && !isProductionBuild()
          ? t('labelWithBuild', { version: info.version, build: info.build })
          : t('label', { version: info.version })}
      </Text>
    </YStack>
  );
}
