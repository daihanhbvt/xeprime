import { Linking, Platform } from 'react-native';
import {
  MOBILE_APP_SCHEME,
  MOBILE_CLIENT_APP,
  REGISTRATION_TRACK,
  type RegistrationTrack,
} from '@xeprime/types';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';

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
  /**
   * Đăng ký cho thuê — Partner mở màn chọn cách cho thuê (`/manage/register`) sau khi đăng nhập
   * hoặc tạo tài khoản đối tác (ADR 0053: cả hai tuyến đăng ký ở app/site partner).
   */
  REGISTER: 'register',
  /** Một lời mời vào gian hàng — `/invites/<token>` của app Partner. */
  INVITE: 'invite',
} as const;

export type PartnerAppTarget = (typeof PARTNER_APP_TARGET)[keyof typeof PARTNER_APP_TARGET];

/**
 * Thử mở app Partner đã cài. Trả `false` khi máy không mở được (chưa cài, hoặc hệ điều hành
 * từ chối) — nơi gọi hiện lời nhắc tải, KHÔNG coi là lỗi.
 */
/**
 * Bước ĐẦU của một tuyến ở app Partner — gương `partnerTrackStartHref` bên web: hoa hồng ⇒ wizard đăng
 * xe nhanh, gói ⇒ onboarding gói kèm `track`; chưa chọn tuyến ⇒ màn chọn cách cho thuê.
 */
const TRACK_START_PATH: Record<RegistrationTrack, string> = {
  [REGISTRATION_TRACK.COMMISSION]: `/list-your-vehicle/register?from=${VEHICLE_REGISTRATION_SOURCE.MARKETPLACE}`,
  [REGISTRATION_TRACK.PACKAGE]: `/manage/onboarding?track=${REGISTRATION_TRACK.PACKAGE}`,
};
const CHOOSE_TRACK_PATH = '/manage/register';

/** Cửa vào tài khoản ở app Partner — tài khoản đối tác TÁCH với tài khoản khách (ADR 0053). */
export const PARTNER_AUTH_ENTRY = {
  REGISTER: 'register',
  LOGIN: 'login',
} as const;
export type PartnerAuthEntry = (typeof PARTNER_AUTH_ENTRY)[keyof typeof PARTNER_AUTH_ENTRY];

/**
 * Link mở app Partner cho một ý định. Đăng ký cho thuê đi qua MÀN ĐĂNG KÝ (hoặc ĐĂNG NHẬP) của app
 * Partner kèm `?next=` là bước đầu của tuyến — app Partner cất đích rồi đưa thẳng tới đó sau khi xong;
 * người đã đăng nhập sẵn ở Partner được chuyển thẳng (`usePendAuthNext`).
 */
export function partnerAppUrl(
  target: PartnerAppTarget,
  options: { inviteToken?: string; track?: RegistrationTrack; entry?: PartnerAuthEntry } = {},
): string {
  const { inviteToken, track, entry = PARTNER_AUTH_ENTRY.REGISTER } = options;
  if (target === PARTNER_APP_TARGET.INVITE && inviteToken) {
    return `${PARTNER_SCHEME}:///invites/${encodeURIComponent(inviteToken)}`;
  }
  if (target === PARTNER_APP_TARGET.REGISTER) {
    const next = track ? TRACK_START_PATH[track] : CHOOSE_TRACK_PATH;
    return `${PARTNER_SCHEME}:///${entry}?next=${encodeURIComponent(next)}`;
  }
  return `${PARTNER_SCHEME}:///`;
}

export async function openPartnerApp(
  target: PartnerAppTarget = PARTNER_APP_TARGET.HOME,
  options: { inviteToken?: string; track?: RegistrationTrack; entry?: PartnerAuthEntry } = {},
): Promise<boolean> {
  const url = partnerAppUrl(target, options);
  try {
    await Linking.openURL(url);
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

/**
 * Link CỬA HÀNG của app Partner — chỉ App Store / Google Play, KHÔNG rơi về trang web như
 * {@link partnerDownloadUrl}. `null` = app chưa lên cửa hàng: màn handoff nói thẳng điều đó thay vì
 * đẩy người dùng sang một trang web không cài được gì.
 */
export function partnerStoreUrl(): string | null {
  const storeUrl =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_PARTNER_IOS_STORE_URL
      : process.env.EXPO_PUBLIC_PARTNER_ANDROID_STORE_URL;
  return storeUrl || null;
}
