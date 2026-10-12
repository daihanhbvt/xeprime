import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Nhớ lượt cổng (MoMo/VNPAY) đang theo dõi của TỪNG chuyến — bản native của `?paymentOrder=`
 * bên web (ADR 0058).
 *
 * Tham số route sống qua lần rời màn rồi quay lại trong cùng tiến trình, nhưng KHÔNG sống qua lần
 * Android giết tiến trình khi khách đang ở app ví. Mất ID lượt ⇒ nút trả hiện lại ⇒ khách có thể
 * trả lần hai qua cổng kia. Nên ghi thêm xuống kho bền, theo `tripId`, kèm hạn dùng.
 *
 * ID lượt KHÔNG phải bí mật (server chỉ trả lượt cho đúng chủ phiên); nó nằm ở kho bảo mật chỉ vì
 * đó là kho bền DUY NHẤT của app (xem `SECURE_KEY`). Dữ liệu nhỏ: bản ghi quá hạn bị dọn mỗi lần ghi.
 */
type Entry = { orderId: string; until: number };
type Memory = Record<string, Entry>;

/** Giữ thêm sau hạn của lượt — đủ cho IPN muộn/đối soát, đủ ngắn để không tích rác. */
export const TRIP_ORDER_MEMORY_GRACE_MS = 24 * 60 * 60_000;

async function readAll(): Promise<Memory> {
  const raw = await getSecureItem(SECURE_KEY.TRIP_PAYMENT_ORDERS);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Memory) : {};
  } catch {
    return {};
  }
}

async function writeAll(memory: Memory, now: number): Promise<void> {
  const pruned: Memory = {};
  for (const [tripId, entry] of Object.entries(memory)) {
    if (entry && typeof entry.orderId === 'string' && entry.until > now) pruned[tripId] = entry;
  }
  try {
    await setSecureItem(SECURE_KEY.TRIP_PAYMENT_ORDERS, JSON.stringify(pruned));
  } catch {
    // Ghi nhớ là tiện ích — tham số route vẫn giữ lượt trong tiến trình này.
  }
}

export async function recallTripOrder(tripId: string, now = Date.now()): Promise<string | null> {
  const entry = (await readAll())[tripId];
  return entry && entry.until > now ? entry.orderId : null;
}

export async function rememberTripOrder(
  tripId: string,
  orderId: string,
  expiresAt: string,
  now = Date.now(),
): Promise<void> {
  const expiry = new Date(expiresAt).getTime();
  const until = (Number.isNaN(expiry) ? now : expiry) + TRIP_ORDER_MEMORY_GRACE_MS;
  const memory = await readAll();
  memory[tripId] = { orderId, until };
  await writeAll(memory, now);
}

export async function forgetTripOrder(tripId: string, orderId: string, now = Date.now()) {
  const memory = await readAll();
  if (memory[tripId]?.orderId !== orderId) return;
  delete memory[tripId];
  await writeAll(memory, now);
}
