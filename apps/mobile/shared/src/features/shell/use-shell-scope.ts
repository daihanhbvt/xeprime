import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { isAppScope, resolveScopeCapability, type AppScope } from './app-scope';
import { scopeHome } from '@/app-profile';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { deleteSecureItem, getSecureItem, setSecureItem, SECURE_KEY } from '@/lib/secure-storage';
import { fireAndForget } from '@/lib/fire-and-forget';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { lastRouteChanged, scopeChanged } from './shell-scope.slice';

/*
 * "Màn đầu của mỗi khu" từ đợt tách app (25/09/2026) là luật CỦA TỪNG APP — nó sống ở
 * `@/app-profile` (Customer: MANAGE ⇒ màn handoff `/partner`; Partner: CUSTOMER ⇒
 * `/not-eligible`). Re-export để các nơi đang import từ đây không phải đổi.
 */
export { scopeHome };

/** Lựa chọn khu lần trước. Giá trị lạ (bản cũ, dữ liệu hỏng) coi như chưa chọn gì. */
export async function readRememberedScope(): Promise<AppScope | null> {
  const raw = await getSecureItem(SECURE_KEY.SHELL_SCOPE);
  return isAppScope(raw) ? raw : null;
}

export async function rememberScope(scope: AppScope): Promise<void> {
  await setSecureItem(SECURE_KEY.SHELL_SCOPE, scope);
}

export async function forgetScope(): Promise<void> {
  await deleteSecureItem(SECURE_KEY.SHELL_SCOPE);
}

export interface ShellScope {
  scope: AppScope;
  /** Có membership gian hàng — tín hiệu DUY NHẤT bật khu quản lý. */
  canManage: boolean;
  /**
   * Đổi khu: ghi đích đang dở, nhớ lựa chọn, rồi `replace` sang đích của khu kia.
   *
   * `destination` ghi đè đích mặc định (màn đang dở, hoặc màn đầu của khu) khi NƠI GỌI biết
   * người dùng muốn tới đâu — menu tài khoản của chủ xe dẫn thẳng vào "Danh sách xe" và "Lịch
   * xe" của khu quản lý. Thiếu nó thì bấm "Lịch xe" lại rơi về màn quản lý mở lần trước.
   */
  switchTo: (target: AppScope, destination?: Href) => void;
  /** Ghi đích đang dở của một khu — layout của khu đó gọi mỗi lần route đổi. */
  trackRoute: (scope: AppScope, route: string) => void;
}

/**
 * Đọc và đổi khu app.
 *
 * `switchTo` dùng `replace`, KHÔNG `push`: hai khu không phải hai nấc sâu của cùng một cây, và
 * `push` sẽ để lại một nút lui dẫn ngược về khu vừa rời — đúng thứ người dùng không mong đợi.
 */
export function useShellScope(): ShellScope {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const scope = useAppSelector((s) => s.shellScope.scope);
  const lastRoute = useAppSelector((s) => s.shellScope.lastRoute);
  const { data: user } = useCurrentUser();
  const capability = resolveScopeCapability(user);
  const { packageOnboardingPending } = capability;

  const trackRoute = useCallback(
    (target: AppScope, route: string) => {
      dispatch(lastRouteChanged({ scope: target, route }));
    },
    [dispatch],
  );

  const switchTo = useCallback(
    (target: AppScope, destination?: Href) => {
      /*
       * Đích tường minh vẫn phải đi được KHI ĐÃ Ở ĐÚNG KHU: chủ xe mở menu tài khoản từ khu
       * khách thì `target !== scope`, nhưng một người đang ở khu quản lý cũng tới được cùng menu
       * đó — và với họ "Lịch xe" phải mở lịch, không phải không làm gì cả.
       */
      if (target === scope && !destination) return;

      if (target !== scope) {
        dispatch(scopeChanged(target));
        fireAndForget(() => rememberScope(target), 'useShellScope.rememberScope');
      }

      /*
       * Bước còn nợ thắng cả đích đã nhớ: một gian hàng `package_pending` có thể còn `lastRoute`
       * từ lần trước, và `ScopeGuard` sẽ đá họ ra khỏi đúng màn đó.
       */
      const fallback = scopeHome(target, packageOnboardingPending);
      const remembered = packageOnboardingPending
        ? undefined
        : (lastRoute[target] as Href | undefined);
      // Đích đã nhớ là một chuỗi đường dẫn thật đã từng render — dùng thẳng làm `Href`.
      //
      // `dismissTo` (POP_TO) chứ KHÔNG `replace`: chủ gian hàng đăng nhập từ màn Khám phá có ngăn
      // xếp gốc `[(tabs), manage]`. `replace` thay `manage` bằng MỘT `(tabs)` THỨ HAI, bản cũ nằm
      // lại (native đã tháo, React vẫn giữ) và nhận cập nhật khi đổi tab ⇒ Fabric
      // `addViewAt … already has a parent` ngay cú chạm tab "Chuyến" (tái hiện trên emulator
      // 25/09/2026). POP_TO lùi về khu đã có trong ngăn xếp; chưa có thì thay màn hiện tại — đúng
      // như `replace` cũ.
      router.dismissTo(destination ?? remembered ?? fallback);
    },
    [dispatch, lastRoute, packageOnboardingPending, router, scope],
  );

  return {
    scope,
    canManage: capability.canManage,
    switchTo,
    trackRoute,
  };
}
