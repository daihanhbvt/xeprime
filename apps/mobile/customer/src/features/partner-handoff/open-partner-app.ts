import { Linking, Platform } from 'react-native';
import { MOBILE_APP_SCHEME, MOBILE_CLIENT_APP } from '@xeprime/types';

/**
 * Mở/tải app XePrime Partner từ app Customer — abstraction DUY NHẤT cho việc chuyển app.
 * Không component nào tự ghép URL scheme hay hardcode link store.
 *
 * Deep link sang Partner chỉ mang Ý ĐỊNH MỞ MÀN (login/onboarding/dashboard do Partner tự
 * quyết theo phiên + `onboarding_state` đọc từ server) — KHÔNG BAO GIỜ mang access/refresh
 * token hay dữ liệu mật trong URL: deep link đi qua hệ điều hành và nằm lại trong log của nó.
 */
const PARTNER_SCHEME = MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.PARTNER];

export const PARTNER_APP_TARGET = {
  /** Màn điều phối gốc — Partner tự đưa vào login/onboarding/dashboard theo phiên. */
  HOME: 'home',
  /** Tiếp tục onboarding gói — Partner mở `/manage/onboarding` sau khi đăng nhập. */
  ONBOARDING: 'onboarding',
} as const;

export type PartnerAppTarget = (typeof PARTNER_APP_TARGET)[keyof typeof PARTNER_APP_TARGET];

const TARGET_URL: Record<PartnerAppTarget, string> = {
  [PARTNER_APP_TARGET.HOME]: `${PARTNER_SCHEME}:///`,
  [PARTNER_APP_TARGET.ONBOARDING]: `${PARTNER_SCHEME}:///manage/onboarding`,
};

/**
 * Thử mở app Partner đã cài. Trả `false` khi máy không mở được (chưa cài, hoặc hệ điều hành
 * từ chối) — nơi gọi hiện lời nhắc tải, KHÔNG coi là lỗi.
 */
export async function openPartnerApp(
  target: PartnerAppTarget = PARTNER_APP_TARGET.HOME,
): Promise<boolean> {
  try {
    await Linking.openURL(TARGET_URL[target]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Link tải app Partner theo nền tảng. Đọc từ env build (`EXPO_PUBLIC_PARTNER_*_URL`) vì app
 * chưa phát hành store — chưa khai thì rơi về trang web (`EXPO_PUBLIC_WEB_URL`), nơi luôn có
 * hướng dẫn mới nhất. KHÔNG hardcode URL store trong component.
 */
export function partnerDownloadUrl(): string | null {
  const storeUrl =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_PARTNER_IOS_STORE_URL
      : process.env.EXPO_PUBLIC_PARTNER_ANDROID_STORE_URL;
  return storeUrl || process.env.EXPO_PUBLIC_WEB_URL || null;
}
