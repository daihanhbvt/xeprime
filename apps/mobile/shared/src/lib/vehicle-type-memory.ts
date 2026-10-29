import { VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Loại xe khách đã TỰ CHỌN gần nhất (ô tô hoặc xe máy), nhớ lại giữa các màn và giữa các lần mở app.
 *
 * Bản native của `apps/web/src/lib/vehicle-type-memory.ts` — **cùng luật, khác kho** (cùng cách
 * `province-memory.ts` bám bản web). Đọc bản web trước khi sửa điều kiện nào ở đây; hai bản không
 * tự đồng bộ.
 *
 * - Chỉ ghi khi khách CHỦ ĐỘNG chọn loại xe; loại xe điền sẵn không bao giờ ghi ngược vào đây.
 * - Quá `MAX_AGE_DAYS` hoặc mã không còn thuộc `VEHICLE_TYPE_VALUES` ⇒ coi như chưa nhớ.
 * - Đọc BẤT ĐỒNG BỘ (`expo-secure-store` chỉ có API promise) — nơi gọi đọc trong effect.
 */

const MAX_AGE_DAYS = 180;

interface StoredShape {
  readonly vehicleType: VehicleType;
  readonly savedAt: string;
}

export async function readRememberedVehicleType(): Promise<VehicleType | null> {
  const raw = await getSecureItem(SECURE_KEY.VEHICLE_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!parsed.vehicleType || !parsed.savedAt) return null;
    if (!VEHICLE_TYPE_VALUES.includes(parsed.vehicleType)) return null;
    const at = Date.parse(parsed.savedAt);
    if (Number.isNaN(at) || Date.now() - at >= MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
    return parsed.vehicleType;
  } catch {
    // JSON hỏng (bản cũ, hoặc ghi dở lúc app bị kill) — coi như chưa nhớ gì.
    return null;
  }
}

/** Ghi lại một lựa chọn CHỦ ĐỘNG. Trả `void`: ghi nhớ hỏng không được giữ cú chạm của khách lại. */
export function rememberVehicleType(vehicleType: VehicleType): void {
  if (!VEHICLE_TYPE_VALUES.includes(vehicleType)) return;
  const payload: StoredShape = { vehicleType, savedAt: new Date().toISOString() };
  void setSecureItem(SECURE_KEY.VEHICLE_TYPE, JSON.stringify(payload)).catch(() => {
    // Keystore từ chối ghi: mất tiện ích, không mất dữ liệu.
  });
}
