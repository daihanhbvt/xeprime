import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import {
  clearFavoriteIntent,
  favoriteIntentSnapshot,
  liveFavoriteIntent,
  subscribeFavoriteIntent,
  type FavoriteIntent,
} from '../favorite-intent';
import { useFavoriteToggle } from '../hooks/use-favorite';

/**
 * Hoàn tất lượt thích/bỏ thích bị gián đoạn vì chưa đăng nhập (BRD §5.1.7) — bản native của web
 * `FavoriteIntentResumer`, gắn MỘT lần ở vỏ app khách.
 *
 * "Đã đăng nhập" = `/auth/me` nạp SAU lúc ghi ý định. Phiên vừa chết (401) mà cache còn giữ người
 * dùng CŨ thì bản cũ đó không được tính — nếu không, lượt lưu chạy lại ngay bằng một phiên không
 * còn, lại 401, lại mời: một vòng lặp (cùng phép so với ADR 0060 §7).
 */
export function FavoriteIntentResumer() {
  const raw = useSyncExternalStore(subscribeFavoriteIntent, favoriteIntentSnapshot);
  const intent = liveFavoriteIntent(raw);
  const meQuery = useCurrentUser();

  if (!intent || !meQuery.data || meQuery.dataUpdatedAt <= intent.savedAt) return null;
  return <ResumeFavorite key={`${intent.vehicleId}:${intent.savedAt}`} intent={intent} />;
}

function ResumeFavorite({ intent }: { intent: FavoriteIntent }) {
  const { apply } = useFavoriteToggle(intent.vehicleId);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Xoá TRƯỚC khi gửi: lượt này hỏng thì `onSettled` tự hoàn tác/báo lỗi (hoặc ghi ý định mới
    // nếu lại 401) — giữ ý định cũ là mời lặp lại vô hạn.
    clearFavoriteIntent();
    apply(intent.favorite, { announce: intent.favorite });
  }, [apply, intent.favorite]);

  return null;
}
