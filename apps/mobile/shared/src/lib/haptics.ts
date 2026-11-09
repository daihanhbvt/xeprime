/**
 * Rung nhẹ an toàn — `expo-haptics` là module NATIVE: bản build cũ chưa có nó thì mọi lời gọi
 * thành no-op thay vì làm sập app (bài học lỗi AsyncStorage null). Nạp lười bằng `require`
 * trong try/catch, nhớ kết quả một lần.
 */
type HapticsModule = {
  impactAsync: (style: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  notificationAsync: (type: unknown) => Promise<void>;
  ImpactFeedbackStyle: { Light: unknown };
  NotificationFeedbackType: { Success: unknown; Error: unknown };
};

let cached: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lười để chịu được bản build thiếu module native
    const mod = require('expo-haptics') as HapticsModule;
    cached = mod && typeof mod.impactAsync === 'function' ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

function run(fn: (h: HapticsModule) => Promise<void>): void {
  const h = load();
  if (!h) return;
  try {
    fn(h).catch(() => undefined);
  } catch {
    // Module JS có mà native chưa link — bỏ qua.
  }
}

export const haptics = {
  /** Nhấn nút chính, thả tim. */
  light: () => run((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)),
  /** Chọn ngày, chuyển tab. */
  selection: () => run((h) => h.selectionAsync()),
  success: () => run((h) => h.notificationAsync(h.NotificationFeedbackType.Success)),
  error: () => run((h) => h.notificationAsync(h.NotificationFeedbackType.Error)),
};
