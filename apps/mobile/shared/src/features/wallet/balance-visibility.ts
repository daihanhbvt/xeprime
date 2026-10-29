import { useEffect, useSyncExternalStore } from 'react';
import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Ẩn/hiện số dư của viên "Số dư" — bản native của kho `localStorage` trong `WalletBalancePill` web
 * (khoá `xp.wallet.balance.hidden`, giá trị `'1'`/`'0'`). Ghi nhớ trên máy, qua các lần mở app.
 *
 * Giữ bản trong bộ nhớ làm nguồn đồng bộ cho `useSyncExternalStore` (mọi viên trên màn đổi cùng
 * lúc); SecureStore chỉ là chỗ lưu bền, đọc MỘT lần lúc viên đầu tiên mount. Đọc/ghi hỏng thì coi
 * như đang hiện — mất tiện ích, không mất gì.
 *
 * Khác `localStorage` (đọc đồng bộ), SecureStore đọc BẤT ĐỒNG BỘ. Ba trạng thái thay vì hai:
 * - `pending`: chưa đọc xong ⇒ viên hiện MẶT NẠ. Hiện số thật một nhịp rồi mới che là lộ đúng thứ
 *   người dùng đã chọn giấu.
 * - Bấm con mắt TRƯỚC khi đọc xong ⇒ lựa chọn vừa bấm thắng; kết quả đọc về muộn bị bỏ qua.
 */
type Visibility = 'pending' | 'shown' | 'hidden';

let state: Visibility = 'pending';
let reading = false;
let touched = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Visibility {
  return state;
}

export function useBalanceVisibility(): { hidden: boolean; ready: boolean } {
  useEffect(() => {
    if (reading || state !== 'pending') return;
    reading = true;
    void getSecureItem(SECURE_KEY.WALLET_BALANCE_HIDDEN)
      .then((raw) => raw === '1')
      .catch(() => false)
      .then((stored) => {
        if (touched) return;
        state = stored ? 'hidden' : 'shown';
        emit();
      });
  }, []);
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { hidden: current === 'hidden', ready: current !== 'pending' };
}

export function setBalanceHidden(next: boolean): void {
  touched = true;
  state = next ? 'hidden' : 'shown';
  emit();
  void setSecureItem(SECURE_KEY.WALLET_BALANCE_HIDDEN, next ? '1' : '0').catch(() => undefined);
}
