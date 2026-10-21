'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  clearFavoriteIntent,
  favoriteIntentSnapshot,
  parseFavoriteIntent,
  serverFavoriteIntentSnapshot,
  subscribeFavoriteIntent,
  type FavoriteIntent,
} from '../favorite-intent';
import { useFavoriteToggle } from '../hooks/use-favorite';

/**
 * Hoàn tất lượt thích/bỏ thích bị gián đoạn vì chưa đăng nhập (BRD §5.1.7) — gắn MỘT lần ở vỏ
 * site khách, nên chạy được cả khi khách quay về sau Google/Facebook (rời trang).
 *
 * "Đã đăng nhập" = `/auth/me` nạp SAU lúc ghi ý định. Phiên vừa chết (401) mà cache còn giữ người
 * dùng CŨ thì bản cũ đó không được tính — nếu không, lượt lưu chạy lại ngay sau lưng hộp đăng nhập
 * bằng một phiên không còn, lại 401, lại mời: một vòng lặp (cùng phép so với ADR 0060 §7).
 */
export function FavoriteIntentResumer() {
  const raw = useSyncExternalStore(
    subscribeFavoriteIntent,
    favoriteIntentSnapshot,
    serverFavoriteIntentSnapshot,
  );
  const intent = useMemo(() => parseFavoriteIntent(raw), [raw]);
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
