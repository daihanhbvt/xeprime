import { useEffect, useState } from 'react';
import { APP_SCOPE, resolveInitialScope, type AppScope } from './app-scope';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { SESSION_STATUS, useSessionGate } from '@/features/auth/hooks/use-session-gate';
import { useAppDispatch } from '@/store/hooks';
import { readRememberedScope } from './use-shell-scope';
import { scopeChanged } from './shell-scope.slice';

/**
 * "Mở app ra thì hạ cánh ở khu nào" — dùng ở route gốc `app/index.tsx`.
 *
 * Vì sao phải có hook riêng thay vì `<Redirect>` thẳng: quyết định phụ thuộc HAI nguồn bất đồng
 * bộ — `/auth/me` (mạng) và khu đã nhớ (Keychain). Điều hướng trước khi cả hai về là đá chủ gian
 * hàng vào marketplace rồi giật ngược sang khu quản lý một khung hình sau; đó đúng là triệu
 * chứng "refresh xong không vào đúng màn".
 *
 * Luật quyết định KHÔNG nằm ở đây — nó ở `resolveInitialScope`, dùng chung với `useEnterApp`, để
 * "mở app" và "vừa đăng nhập" không thể trôi khỏi nhau.
 *
 * Trả `null` = chưa quyết được, hãy hiện màn chờ. Mạng chết KHÔNG chặn ở đây: khu khách là khu
 * công khai, cứ vào rồi từng màn tự hiện lỗi của nó.
 */
export function useLandingScope(): AppScope | null {
  const dispatch = useAppDispatch();
  const { status } = useSessionGate();
  const { data: user } = useCurrentUser();
  /** Bọc trong object để phân biệt "chưa đọc xong" (`null`) với "đọc xong, chưa nhớ gì". */
  const [remembered, setRemembered] = useState<{ value: AppScope | null } | null>(null);

  useEffect(() => {
    let alive = true;
    readRememberedScope()
      .then((value) => {
        if (alive) setRemembered({ value });
      })
      .catch(() => {
        // Keychain hỏng (máy khoá, keystore lỗi) chỉ làm mất LỰA CHỌN lần trước, không được làm
        // kẹt người dùng ở màn chờ — `resolveInitialScope` vốn có luật cho "chưa nhớ gì".
        if (alive) setRemembered({ value: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  // Chưa đăng nhập thì khu khách là đáp án duy nhất — không đợi Keychain làm gì.
  const guest = status === SESSION_STATUS.UNAUTHENTICATED;
  const settled = guest || (status !== SESSION_STATUS.LOADING && remembered !== null);

  const scope: AppScope | null = !settled
    ? null
    : guest
      ? APP_SCOPE.CUSTOMER
      : resolveInitialScope({ user, remembered: remembered?.value ?? null });

  // Đồng bộ vỏ app với đích thật; thiếu bước này thì `ScopeSwitcher` tô sáng nhầm khu ở lần mở
  // đầu. Trong effect chứ không trong thân render — dispatch lúc đang render một component khác
  // là nguồn của cảnh báo "update during render".
  useEffect(() => {
    if (scope) dispatch(scopeChanged(scope));
  }, [dispatch, scope]);

  return scope;
}
