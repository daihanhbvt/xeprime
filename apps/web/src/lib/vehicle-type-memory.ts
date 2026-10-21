import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';

/**
 * Loại xe người dùng đã TỰ CHỌN gần nhất (ô tô hoặc xe máy), nhớ lại giữa các màn hình và qua F5.
 *
 * Cùng cơ chế với `province-memory.ts` và `rental-range-memory.ts`:
 * - Ghi vào `localStorage` khi người dùng chủ động chọn loại xe.
 * - Hỗ trợ `useSyncExternalStore` để an toàn hydration (trả `null` ở SSR, giá trị thật ở client).
 */

const STORAGE_KEY = 'xp.vehicleType';
const MAX_AGE_DAYS = 180;

interface StoredShape {
  readonly vehicleType: VehicleType;
  readonly savedAt: string;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRememberedVehicleType(): VehicleType | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!parsed.vehicleType || !parsed.savedAt) return null;
    if (!VEHICLE_TYPE_VALUES.includes(parsed.vehicleType)) return null;
    const at = Date.parse(parsed.savedAt);
    if (Number.isNaN(at) || Date.now() - at >= MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
    return parsed.vehicleType;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

export function subscribeRememberedVehicleType(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function rememberedVehicleTypeSnapshot(): VehicleType | null {
  return readRememberedVehicleType();
}

export function serverRememberedVehicleTypeSnapshot(): VehicleType | null {
  return null;
}

export function rememberVehicleType(type: VehicleType): void {
  const store = storage();
  if (!store) return;
  try {
    if (!VEHICLE_TYPE_VALUES.includes(type)) return;
    const payload: StoredShape = { vehicleType: type, savedAt: new Date().toISOString() };
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
    notify();
  } catch {
    // Không ném ra ngoài
  }
}

