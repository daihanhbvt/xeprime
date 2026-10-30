import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Khoá trong Keychain (iOS) / Keystore (Android). Khai báo tập trung vì `expo-secure-store`
 * chỉ nhận `[A-Za-z0-9._-]` — ký tự khác ném lỗi lúc CHẠY, không phải lúc biên dịch.
 *
 * `REFRESH_TOKEN` là bí mật DUY NHẤT được ghi xuống đĩa (ADR 0017): access token sống 15 phút
 * và ở lại trong bộ nhớ, ghi nó xuống chỉ thêm một chỗ để rò.
 */
export const SECURE_KEY = {
  REFRESH_TOKEN: 'xp.refresh.token',
  LOCALE: 'xp.locale',
  SHELL_SCOPE: 'xp.shell.scope',
  /**
   * Hai khoá dưới đây KHÔNG phải bí mật — chúng là tiện ích ghi nhớ lựa chọn của khách, bản
   * native của `localStorage` bên web. Chúng nằm ở đây vì app chỉ có MỘT kho dữ liệu bền
   * (`expo-secure-store`); thêm `AsyncStorage`/`MMKV` chỉ để nhớ một khoảng ngày là bắt mọi máy
   * dựng lại dev build. Bị mã hoá thừa không hại gì; không có chỗ lưu mới hại.
   */
  RENTAL_RANGE: 'xp.rentalRange',
  PROVINCE_CODE: 'xp.provinceCode',
  /** Loại xe khách TỰ CHỌN gần nhất (ô tô / xe máy) — `lib/vehicle-type-memory.ts`. Không phải bí mật. */
  VEHICLE_TYPE: 'xp.vehicleType',
  /** Ẩn/hiện SỐ DƯ trên viên số dư của tab Tài khoản — `wallet/balance-visibility.ts`. Không phải bí mật (web `localStorage` `xp.wallet.balance.hidden`). */
  WALLET_BALANCE_HIDDEN: 'xp.wallet.balance.hidden',
  DELIVERY_ADDRESS: 'xp.deliveryAddress',
  /** Tỉnh SUY RA từ vị trí thiết bị — gợi ý của máy, không phải lựa chọn của người dùng. */
  GEO_PROVINCE: 'xp.geoProvince',
  /** Lượt cổng MoMo/VNPAY đang theo dõi theo chuyến — `features/payment-gateway/trip-order-memory`. */
  TRIP_PAYMENT_ORDERS: 'xp.tripPaymentOrders',
  /** Giao diện khách chọn (Sáng · Tối) — `theme/color-scheme.ts`. Không phải bí mật. */
  THEME_PREFERENCE: 'xp.themePreference',
  /** Chế độ xem kết quả tìm xe (lưới · danh sách) — web `localStorage` `xp:marketplace-view-mode`. Không phải bí mật. */
  MARKETPLACE_VIEW_MODE: 'xp.marketplaceViewMode',
  /** Dấu tick "Checklist nhận xe" theo chuyến — ghi nhớ CÁ NHÂN, không gửi server (web `pickup-checklist-memory`). */
  PICKUP_CHECKLIST: 'xp.pickupChecklist',
} as const;

export type SecureKey = (typeof SECURE_KEY)[keyof typeof SECURE_KEY];

/**
 * `expo-secure-store` không có bản cài cho web; `expo start --web` sẽ nổ ngay lần gọi đầu.
 * Bản web lùi về `localStorage` — KHÔNG an toàn, nên web chỉ dùng để xem giao diện.
 */
const isWeb = Platform.OS === 'web';

/**
 * ADR 0017: refresh token chỉ sống ở Keychain/Keystore. Nó đổi được thành phiên đầy đủ, mà mọi
 * script trên trang đều đọc được `localStorage`. Thà `expo start --web` không đăng nhập được
 * (nó chỉ để xem giao diện) còn hơn có một đường rò chỉ tồn tại ở nhánh web.
 */
const NEVER_ON_WEB: readonly SecureKey[] = [SECURE_KEY.REFRESH_TOKEN];

function blockedOnWeb(key: SecureKey): boolean {
  return isWeb && NEVER_ON_WEB.includes(key);
}

export async function getSecureItem(key: SecureKey): Promise<string | null> {
  if (blockedOnWeb(key)) return null;
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;

  // Keychain/Keystore có thể từ chối đọc khi thiết bị vừa khởi động và chưa mở khoá lần nào.
  // Lỗi ở đây luôn có nghĩa "chưa có giá trị dùng được", không phải lỗi cần đẩy lên UI.
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setSecureItem(key: SecureKey, value: string): Promise<void> {
  if (blockedOnWeb(key)) return;
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteSecureItem(key: SecureKey): Promise<void> {
  if (blockedOnWeb(key)) return;
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Xoá thứ không tồn tại không phải lỗi — đăng xuất phải luôn đi tới cùng.
  }
}

/**
 * Đọc ĐỒNG BỘ — chỉ dành cho số ít giá trị phải có TRƯỚC khi module khác nạp (giao diện sáng/tối
 * chọn bảng màu ngay lúc `theme/tokens.ts` được import). Lỗi Keystore ⇒ `null`, như bản bất
 * đồng bộ.
 */
export function getSecureItemSync(key: SecureKey): string | null {
  if (blockedOnWeb(key)) return null;
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}
