/**
 * Thông báo cập nhật app native — so phiên bản `x.y.z` và quyết mức nhắc.
 * Dùng chung API (kiểm cấu hình) + app native (quyết hộp thoại). Framework-free.
 */

export const NATIVE_APP_KEYS = ['customer', 'partner'] as const;
export type NativeAppKey = (typeof NATIVE_APP_KEYS)[number];

export const NATIVE_PLATFORMS = ['ios', 'android'] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

export const APP_UPDATE_LEVEL = {
  NONE: 'none',
  OPTIONAL: 'optional',
  REQUIRED: 'required',
} as const;
export type AppUpdateLevel = (typeof APP_UPDATE_LEVEL)[keyof typeof APP_UPDATE_LEVEL];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** `[major, minor, patch]`, hoặc `null` khi không phải `x.y.z` — `0.0.0` coi là không xác định. */
export function parseAppVersion(value: string | null | undefined): [number, number, number] | null {
  const m = value ? SEMVER.exec(value.trim()) : null;
  if (!m) return null;
  const parts: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return parts.every((n) => n === 0) ? null : parts;
}

/** <0 nếu a < b, 0 nếu bằng, >0 nếu a > b. Gọi sau khi đã parse. */
export function compareAppVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Mức nhắc cập nhật: dưới `min` ⇒ bắt buộc; dưới `latest` ⇒ tuỳ chọn. Bản đang cài không xác định
 * (Expo Go / dev `0.0.0`) ⇒ không nhắc.
 */
export function resolveAppUpdateLevel(
  installed: string | null | undefined,
  config: { latestVersion: string | null; minVersion: string | null },
): AppUpdateLevel {
  const current = parseAppVersion(installed);
  if (!current) return APP_UPDATE_LEVEL.NONE;
  const min = parseAppVersion(config.minVersion);
  if (min && compareAppVersions(current, min) < 0) return APP_UPDATE_LEVEL.REQUIRED;
  const latest = parseAppVersion(config.latestVersion);
  if (latest && compareAppVersions(current, latest) < 0) return APP_UPDATE_LEVEL.OPTIONAL;
  return APP_UPDATE_LEVEL.NONE;
}
